import mongoose, { Schema, type Document, type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { proto, type WASocket } from '@whiskeysockets/baileys';
import type { TrackedGroupUser, TrackedGroupUsers } from './whatsapp.ts';

export type ActivityPollStatus = 'open' | 'closed';

export interface ActivityPollParticipant {
  id: string;
  phoneNumber: string | null;
  role: 'member';
}

export interface ActivityPollResponse {
  participantId: string;
  phoneNumber: string | null;
  respondedAt: Date;
}

export interface ActivityPollRecord {
  id: string;
  pollMessageId: string;
  groupId: string;
  question: string;
  status: ActivityPollStatus;
  expectedParticipants: ActivityPollParticipant[];
  responses: ActivityPollResponse[];
  sentAt: Date;
  closedAt: Date | null;
}

export interface ActivityPollSummary extends ActivityPollRecord {
  expectedCount: number;
  respondedCount: number;
  inactiveCount: number;
  respondedParticipants: ActivityPollParticipant[];
  inactiveParticipants: ActivityPollParticipant[];
}

interface IActivityPoll extends Document {
  pollMessageId: string;
  groupId: string;
  question: string;
  status: ActivityPollStatus;
  expectedParticipants: ActivityPollParticipant[];
  responses: ActivityPollResponse[];
  sentAt: Date;
  closedAt: Date | null;
}

const ActivityPollParticipantSchema = new Schema<ActivityPollParticipant>(
  {
    id: { type: String, required: true },
    phoneNumber: { type: String, default: null },
    role: { type: String, enum: ['member'], required: true },
  },
  { _id: false },
);

const ActivityPollResponseSchema = new Schema<ActivityPollResponse>(
  {
    participantId: { type: String, required: true },
    phoneNumber: { type: String, default: null },
    respondedAt: { type: Date, required: true },
  },
  { _id: false },
);

const ActivityPollSchema = new Schema<IActivityPoll>({
  pollMessageId: { type: String, required: true, index: true },
  groupId: { type: String, required: true, index: true },
  question: { type: String, required: true },
  status: { type: String, enum: ['open', 'closed'], required: true, index: true },
  expectedParticipants: { type: [ActivityPollParticipantSchema], default: [] },
  responses: { type: [ActivityPollResponseSchema], default: [] },
  sentAt: { type: Date, required: true, index: true },
  closedAt: { type: Date, default: null },
});

ActivityPollSchema.index({ groupId: 1, pollMessageId: 1 });

const ActivityPollModel: Model<IActivityPoll> =
  (mongoose.models.ActivityPoll as Model<IActivityPoll> | undefined) ??
  mongoose.model<IActivityPoll>('ActivityPoll', ActivityPollSchema);

export interface ActivityPollStore {
  findLatest(): Promise<ActivityPollRecord | null>;
  findOpen(): Promise<ActivityPollRecord | null>;
  findOpenByPollMessage(groupId: string, pollMessageId: string): Promise<ActivityPollRecord | null>;
  insert(record: ActivityPollRecord): Promise<ActivityPollRecord>;
  update(record: ActivityPollRecord): Promise<ActivityPollRecord>;
}

export class ActivityPollOpenError extends Error {
  constructor() {
    super('An activity poll is already open');
    this.name = 'ActivityPollOpenError';
  }
}

export interface ActivityPollResponseEvent {
  groupId: string;
  pollMessageId: string;
  responderId: string;
  respondedAt: Date;
}

type ActivityPollTrackerSocket = Pick<WASocket, 'ev'>;

function recordFromDocument(document: IActivityPoll): ActivityPollRecord {
  return {
    id: document._id.toString(),
    pollMessageId: document.pollMessageId,
    groupId: document.groupId,
    question: document.question,
    status: document.status,
    expectedParticipants: document.expectedParticipants,
    responses: document.responses,
    sentAt: document.sentAt,
    closedAt: document.closedAt,
  };
}

export const mongoActivityPollStore: ActivityPollStore = {
  async findLatest() {
    const document = await ActivityPollModel.findOne().sort({ sentAt: -1 }).exec();
    return document ? recordFromDocument(document) : null;
  },
  async findOpen() {
    const document = await ActivityPollModel.findOne({ status: 'open' }).sort({ sentAt: -1 }).exec();
    return document ? recordFromDocument(document) : null;
  },
  async findOpenByPollMessage(groupId, pollMessageId) {
    const document = await ActivityPollModel.findOne({ groupId, pollMessageId, status: 'open' }).exec();
    return document ? recordFromDocument(document) : null;
  },
  async insert(record) {
    const document = await ActivityPollModel.create({
      pollMessageId: record.pollMessageId,
      groupId: record.groupId,
      question: record.question,
      status: record.status,
      expectedParticipants: record.expectedParticipants,
      responses: record.responses,
      sentAt: record.sentAt,
      closedAt: record.closedAt,
    });
    return recordFromDocument(document);
  },
  async update(record) {
    const document = await ActivityPollModel.findByIdAndUpdate(
      record.id,
      {
        pollMessageId: record.pollMessageId,
        groupId: record.groupId,
        question: record.question,
        status: record.status,
        expectedParticipants: record.expectedParticipants,
        responses: record.responses,
        sentAt: record.sentAt,
        closedAt: record.closedAt,
      },
      { new: true },
    ).exec();
    if (!document) throw new Error('Activity poll not found');
    return recordFromDocument(document);
  },
};

export function parseActivityPollQuestionBody(body: unknown): string {
  const question = typeof body === 'object' && body !== null && 'question' in body
    ? (body as { question?: unknown }).question
    : undefined;
  if (typeof question !== 'string' || !question.trim()) {
    throw new Error('question must be a non-empty string');
  }
  return question.trim();
}

function expectedParticipantsFromTrackedGroup(group: TrackedGroupUsers): ActivityPollParticipant[] {
  return group.participants
    .filter((participant): participant is TrackedGroupUser & { role: 'member' } => participant.role === 'member')
    .map((participant) => ({
      id: participant.id,
      phoneNumber: participant.phoneNumber,
      role: 'member',
    }));
}

function matchesParticipant(participant: ActivityPollParticipant, responderId: string): boolean {
  const responderPhone = responderId.split('@')[0];
  return participant.id === responderId || (!!participant.phoneNumber && participant.phoneNumber === responderPhone);
}

export function activityPollSummaryFromRecord(record: ActivityPollRecord): ActivityPollSummary {
  const respondedParticipants = record.expectedParticipants.filter((participant) => (
    record.responses.some((response) => response.participantId === participant.id)
  ));
  const inactiveParticipants = record.expectedParticipants.filter((participant) => (
    !record.responses.some((response) => response.participantId === participant.id)
  ));

  return {
    ...record,
    expectedCount: record.expectedParticipants.length,
    respondedCount: respondedParticipants.length,
    inactiveCount: inactiveParticipants.length,
    respondedParticipants,
    inactiveParticipants,
  };
}

export async function createActivityPollWithStore(options: {
  question: string;
  store: ActivityPollStore;
  now: () => Date;
  listTrackedGroupUsers: () => Promise<TrackedGroupUsers>;
  sendActivityPoll: (question: string) => Promise<{ groupId: string; messageId: string }>;
}): Promise<ActivityPollSummary> {
  const open = await options.store.findOpen();
  if (open) {
    throw new ActivityPollOpenError();
  }

  const trackedGroup = await options.listTrackedGroupUsers();
  const expectedParticipants = expectedParticipantsFromTrackedGroup(trackedGroup);
  const sent = await options.sendActivityPoll(options.question);
  const record = await options.store.insert({
    id: randomUUID(),
    pollMessageId: sent.messageId,
    groupId: sent.groupId,
    question: options.question,
    status: 'open',
    expectedParticipants,
    responses: [],
    sentAt: options.now(),
    closedAt: null,
  });

  return activityPollSummaryFromRecord(record);
}

export async function getLatestActivityPollWithStore(
  store: Pick<ActivityPollStore, 'findLatest'>,
): Promise<ActivityPollSummary | null> {
  const latest = await store.findLatest();
  return latest ? activityPollSummaryFromRecord(latest) : null;
}

export async function closeActivityPollWithStore(options: {
  store: Pick<ActivityPollStore, 'findOpen' | 'update'>;
  pollId: string;
  now: () => Date;
}): Promise<ActivityPollSummary> {
  const open = await options.store.findOpen();
  if (!open || open.id !== options.pollId) {
    throw new Error('Open activity poll not found');
  }

  const updated = await options.store.update({
    ...open,
    status: 'closed',
    closedAt: options.now(),
  });
  return activityPollSummaryFromRecord(updated);
}

export async function recordActivityPollResponseWithStore(options: {
  store: ActivityPollStore;
  groupId: string;
  pollMessageId: string;
  responderId: string;
  respondedAt: Date;
}): Promise<ActivityPollSummary | null> {
  const record = await options.store.findOpenByPollMessage(options.groupId, options.pollMessageId);
  if (!record) return null;

  const participant = record.expectedParticipants.find((expected) => matchesParticipant(expected, options.responderId));
  if (!participant) return activityPollSummaryFromRecord(record);

  const responseExists = record.responses.some((response) => response.participantId === participant.id);
  if (!responseExists) {
    record.responses = [
      ...record.responses,
      {
        participantId: participant.id,
        phoneNumber: participant.phoneNumber,
        respondedAt: options.respondedAt,
      },
    ];
    await options.store.update(record);
  }

  return activityPollSummaryFromRecord(record);
}

function timestampFromMessage(message: proto.IWebMessageInfo): Date {
  return message.messageTimestamp
    ? new Date(Number(message.messageTimestamp) * 1000)
    : new Date();
}

export function extractActivityPollResponsesFromMessages(
  messages: proto.IWebMessageInfo[],
): ActivityPollResponseEvent[] {
  return messages.flatMap((message) => {
    const pollUpdate = message.message?.pollUpdateMessage;
    const creationKey = pollUpdate?.pollCreationMessageKey;
    const groupId = creationKey?.remoteJid ?? message.key?.remoteJid;
    const pollMessageId = creationKey?.id;
    const responderId = message.key?.participant ?? message.key?.remoteJid;
    if (!pollUpdate || !groupId || !pollMessageId || !responderId) {
      return [];
    }

    return [{
      groupId,
      pollMessageId,
      responderId,
      respondedAt: timestampFromMessage(message),
    }];
  });
}

export function startActivityPollTracker(
  socket: ActivityPollTrackerSocket,
  options: { store?: ActivityPollStore } = {},
): void {
  const store = options.store ?? mongoActivityPollStore;

  socket.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const response of extractActivityPollResponsesFromMessages(messages)) {
      recordActivityPollResponseWithStore({
        store,
        groupId: response.groupId,
        pollMessageId: response.pollMessageId,
        responderId: response.responderId,
        respondedAt: response.respondedAt,
      }).catch((err) => console.error('[activity-polls] Error recording poll response:', err));
    }
  });
}

export async function getLatestActivityPoll(): Promise<ActivityPollSummary | null> {
  return getLatestActivityPollWithStore(mongoActivityPollStore);
}

export async function closeActivityPoll(pollId: string): Promise<ActivityPollSummary> {
  return closeActivityPollWithStore({
    store: mongoActivityPollStore,
    pollId,
    now: () => new Date(),
  });
}
