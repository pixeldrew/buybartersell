import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityPollSummaryFromRecord,
  closeActivityPollWithStore,
  createActivityPollWithStore,
  extractActivityPollResponsesFromMessages,
  getLatestActivityPollWithStore,
  parseActivityPollQuestionBody,
  recordActivityPollResponseWithStore,
  startActivityPollTracker,
  type ActivityPollRecord,
  type ActivityPollStore,
} from '../src/activity-polls.ts';
import type { TrackedGroupUsers } from '../src/whatsapp.ts';

function createMemoryPollStore(initial: ActivityPollRecord[] = []): ActivityPollStore {
  const records = new Map(initial.map((record) => [record.id, structuredClone(record)]));

  return {
    async findLatest() {
      return Array.from(records.values()).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0] ?? null;
    },
    async findOpen() {
      return Array.from(records.values()).find((record) => record.status === 'open') ?? null;
    },
    async findOpenByPollMessage(groupId, pollMessageId) {
      return Array.from(records.values()).find((record) => (
        record.status === 'open' &&
        record.groupId === groupId &&
        record.pollMessageId === pollMessageId
      )) ?? null;
    },
    async insert(record) {
      records.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
    async update(record) {
      records.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
  };
}

const trackedGroup: TrackedGroupUsers = {
  groupId: '123@g.us',
  subject: 'Tracked Group',
  participants: [
    { id: 'owner@s.whatsapp.net', phoneNumber: null, role: 'superadmin' },
    { id: 'admin@s.whatsapp.net', phoneNumber: null, role: 'admin' },
    { id: 'member-a@s.whatsapp.net', phoneNumber: '15550000001', role: 'member' },
    { id: 'member-b@s.whatsapp.net', phoneNumber: '15550000002', role: 'member' },
  ],
};

test('parses valid activity poll question bodies', () => {
  assert.equal(
    parseActivityPollQuestionBody({ question: ' Are you still active? ' }),
    'Are you still active?',
  );
});

test('rejects invalid activity poll question bodies', () => {
  assert.throws(
    () => parseActivityPollQuestionBody({ question: '' }),
    /question must be a non-empty string/,
  );
  assert.throws(
    () => parseActivityPollQuestionBody({ question: 123 }),
    /question must be a non-empty string/,
  );
});

test('creates activity polls for member participants only', async () => {
  const store = createMemoryPollStore();
  const result = await createActivityPollWithStore({
    question: 'Are you active?',
    store,
    now: () => new Date('2026-05-17T12:00:00.000Z'),
    listTrackedGroupUsers: async () => trackedGroup,
    sendActivityPoll: async () => ({ messageId: 'poll-1', groupId: '123@g.us' }),
  });

  assert.equal(result.status, 'open');
  assert.equal(result.question, 'Are you active?');
  assert.deepEqual(result.expectedParticipants.map((participant) => participant.id), [
    'member-a@s.whatsapp.net',
    'member-b@s.whatsapp.net',
  ]);
  assert.equal(result.inactiveParticipants.length, 2);
});

test('activity poll creation rejects while another poll is open', async () => {
  const store = createMemoryPollStore([
    {
      id: 'existing',
      pollMessageId: 'poll-1',
      groupId: '123@g.us',
      question: 'Existing?',
      status: 'open',
      expectedParticipants: [],
      responses: [],
      sentAt: new Date('2026-05-17T12:00:00.000Z'),
      closedAt: null,
    },
  ]);

  await assert.rejects(
    () => createActivityPollWithStore({
      question: 'Are you active?',
      store,
      now: () => new Date('2026-05-17T12:01:00.000Z'),
      listTrackedGroupUsers: async () => trackedGroup,
      sendActivityPoll: async () => ({ messageId: 'poll-2', groupId: '123@g.us' }),
    }),
    /An activity poll is already open/,
  );
});

test('gets the latest activity poll summary', async () => {
  const latest: ActivityPollRecord = {
    id: 'latest',
    pollMessageId: 'poll-2',
    groupId: '123@g.us',
    question: 'Latest?',
    status: 'open',
    expectedParticipants: trackedGroup.participants.filter((participant) => participant.role === 'member'),
    responses: [],
    sentAt: new Date('2026-05-17T13:00:00.000Z'),
    closedAt: null,
  };
  const store = createMemoryPollStore([
    {
      ...latest,
      id: 'older',
      pollMessageId: 'poll-1',
      question: 'Older?',
      sentAt: new Date('2026-05-17T12:00:00.000Z'),
    },
    latest,
  ]);

  const summary = await getLatestActivityPollWithStore(store);

  assert.equal(summary?.id, 'latest');
  assert.equal(summary?.inactiveCount, 2);
});

test('closes the open activity poll', async () => {
  const store = createMemoryPollStore([
    {
      id: 'open-poll',
      pollMessageId: 'poll-1',
      groupId: '123@g.us',
      question: 'Are you active?',
      status: 'open',
      expectedParticipants: trackedGroup.participants.filter((participant) => participant.role === 'member'),
      responses: [],
      sentAt: new Date('2026-05-17T12:00:00.000Z'),
      closedAt: null,
    },
  ]);

  const summary = await closeActivityPollWithStore({
    store,
    pollId: 'open-poll',
    now: () => new Date('2026-05-17T13:00:00.000Z'),
  });

  assert.equal(summary.status, 'closed');
  assert.deepEqual(summary.closedAt, new Date('2026-05-17T13:00:00.000Z'));
});

test('records activity poll responses idempotently and updates inactive users', async () => {
  const poll: ActivityPollRecord = {
    id: 'poll-record-1',
    pollMessageId: 'poll-1',
    groupId: '123@g.us',
    question: 'Are you active?',
    status: 'open',
    expectedParticipants: trackedGroup.participants.filter((participant) => participant.role === 'member'),
    responses: [],
    sentAt: new Date('2026-05-17T12:00:00.000Z'),
    closedAt: null,
  };
  const store = createMemoryPollStore([poll]);

  const first = await recordActivityPollResponseWithStore({
    store,
    groupId: '123@g.us',
    pollMessageId: 'poll-1',
    responderId: 'member-a@s.whatsapp.net',
    respondedAt: new Date('2026-05-17T12:05:00.000Z'),
  });
  const second = await recordActivityPollResponseWithStore({
    store,
    groupId: '123@g.us',
    pollMessageId: 'poll-1',
    responderId: 'member-a@s.whatsapp.net',
    respondedAt: new Date('2026-05-17T12:06:00.000Z'),
  });

  assert.equal(first?.respondedParticipants.length, 1);
  assert.equal(second?.respondedParticipants.length, 1);
  assert.deepEqual(second?.inactiveParticipants.map((participant) => participant.id), [
    'member-b@s.whatsapp.net',
  ]);
});

test('activity poll summary computes inactive users from expected minus responders', () => {
  const summary = activityPollSummaryFromRecord({
    id: 'poll-record-1',
    pollMessageId: 'poll-1',
    groupId: '123@g.us',
    question: 'Are you active?',
    status: 'closed',
    expectedParticipants: trackedGroup.participants.filter((participant) => participant.role === 'member'),
    responses: [{ participantId: 'member-b@s.whatsapp.net', phoneNumber: '15550000002', respondedAt: new Date() }],
    sentAt: new Date('2026-05-17T12:00:00.000Z'),
    closedAt: new Date('2026-05-17T13:00:00.000Z'),
  });

  assert.equal(summary.expectedCount, 2);
  assert.equal(summary.respondedCount, 1);
  assert.equal(summary.inactiveCount, 1);
  assert.deepEqual(summary.inactiveParticipants.map((participant) => participant.id), [
    'member-a@s.whatsapp.net',
  ]);
});

test('extracts activity poll responses from Baileys poll update messages', () => {
  const responses = extractActivityPollResponsesFromMessages([
    {
      key: {
        remoteJid: '123@g.us',
        participant: 'member-a@s.whatsapp.net',
      },
      message: {
        pollUpdateMessage: {
          pollCreationMessageKey: {
            remoteJid: '123@g.us',
            id: 'poll-1',
          },
        },
      },
      messageTimestamp: 1_779_000_000,
    },
    {
      key: { remoteJid: '123@g.us', participant: 'member-b@s.whatsapp.net' },
      message: { conversation: 'not a poll update' },
    },
  ]);

  assert.deepEqual(responses, [
    {
      groupId: '123@g.us',
      pollMessageId: 'poll-1',
      responderId: 'member-a@s.whatsapp.net',
      respondedAt: new Date(1_779_000_000 * 1000),
    },
  ]);
});

test('activity poll tracker records responses from message upserts', async () => {
  const poll: ActivityPollRecord = {
    id: 'poll-record-1',
    pollMessageId: 'poll-1',
    groupId: '123@g.us',
    question: 'Are you active?',
    status: 'open',
    expectedParticipants: trackedGroup.participants.filter((participant) => participant.role === 'member'),
    responses: [],
    sentAt: new Date('2026-05-17T12:00:00.000Z'),
    closedAt: null,
  };
  const store = createMemoryPollStore([poll]);
  let messagesUpsertHandler: ((event: { messages: never[]; type: string }) => void) | undefined;

  startActivityPollTracker({
    ev: {
      on: (event: string, handler: (event: { messages: never[]; type: string }) => void) => {
        if (event === 'messages.upsert') messagesUpsertHandler = handler;
      },
    },
  }, { store });

  messagesUpsertHandler?.({
    type: 'notify',
    messages: [{
      key: {
        remoteJid: '123@g.us',
        participant: 'member-a@s.whatsapp.net',
      },
      message: {
        pollUpdateMessage: {
          pollCreationMessageKey: {
            remoteJid: '123@g.us',
            id: 'poll-1',
          },
        },
      },
      messageTimestamp: 1_779_000_000,
    }] as never[],
  });
  await new Promise((resolve) => setImmediate(resolve));

  const summary = await getLatestActivityPollWithStore(store);
  assert.deepEqual(summary?.respondedParticipants.map((participant) => participant.id), [
    'member-a@s.whatsapp.net',
  ]);
});
