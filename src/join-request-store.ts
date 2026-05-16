import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IJoinRequest extends Document {
  token: string;
  userJid: string;
  groupJid: string;
  expiresAt: Date;
  used: boolean;
}

export type JoinRequestRecord = {
  token: string;
  userJid: string;
  groupJid: string;
  expiresAt: Date;
  used: boolean;
};

const JoinRequestSchema = new Schema<IJoinRequest>(
  {
    token:     { type: String, required: true, unique: true, index: true },
    userJid:   { type: String, required: true },
    groupJid:  { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    used:      { type: Boolean, required: true, default: false, index: true },
  },
  { collection: 'join_requests', timestamps: true },
);

export const JoinRequest: Model<IJoinRequest> =
  (mongoose.models.JoinRequest as Model<IJoinRequest> | undefined) ??
  mongoose.model<IJoinRequest>('JoinRequest', JoinRequestSchema);

function tokenError(message: string, code: 'NOT_FOUND' | 'USED' | 'EXPIRED'): Error {
  return Object.assign(new Error(message), { code });
}

export async function createJoinRequest(data: {
  token: string;
  userJid: string;
  groupJid: string;
  expiresAt: Date;
}): Promise<JoinRequestRecord> {
  await JoinRequest.create({ ...data, used: false });
  return { ...data, used: false };
}

export async function resolveJoinRequestToken(token: string): Promise<JoinRequestRecord> {
  const entry = await JoinRequest.findOne({ token }).lean<JoinRequestRecord | null>();
  if (!entry) throw tokenError('Token not found', 'NOT_FOUND');
  if (entry.used) throw tokenError('Token already used', 'USED');
  if (entry.expiresAt < new Date()) {
    await JoinRequest.deleteOne({ token });
    throw tokenError('Token expired', 'EXPIRED');
  }
  return entry;
}

export async function markJoinRequestUsed(token: string): Promise<JoinRequestRecord> {
  const entry = await resolveJoinRequestToken(token);
  await JoinRequest.updateOne({ token }, { $set: { used: true } });
  return entry;
}
