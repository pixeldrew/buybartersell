import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type DirectJoinAuditStatus = 'pending' | 'added' | 'failed';

export interface IDirectJoinAudit extends Document {
  userJid: string;
  termsAcceptedAt: Date;
  termsVersion: string;
  status: DirectJoinAuditStatus;
  whatsappStatus?: string;
  failureReason?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type DirectJoinAuditRecord = {
  id: string;
  userJid: string;
  termsAcceptedAt: Date;
  termsVersion: string;
  status: DirectJoinAuditStatus;
  whatsappStatus?: string;
  failureReason?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const DirectJoinAuditSchema = new Schema<IDirectJoinAudit>(
  {
    userJid:         { type: String, required: true, index: true },
    termsAcceptedAt: { type: Date, required: true },
    termsVersion:    { type: String, required: true },
    status:          { type: String, required: true, enum: ['pending', 'added', 'failed'], index: true },
    whatsappStatus:  { type: String },
    failureReason:   { type: String },
    expiresAt:       { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { collection: 'direct_join_audits', timestamps: true },
);

export const DirectJoinAudit: Model<IDirectJoinAudit> =
  (mongoose.models.DirectJoinAudit as Model<IDirectJoinAudit> | undefined) ??
  mongoose.model<IDirectJoinAudit>('DirectJoinAudit', DirectJoinAuditSchema);

function toRecord(entry: IDirectJoinAudit): DirectJoinAuditRecord {
  return {
    id: String(entry._id),
    userJid: entry.userJid,
    termsAcceptedAt: entry.termsAcceptedAt,
    termsVersion: entry.termsVersion,
    status: entry.status,
    whatsappStatus: entry.whatsappStatus,
    failureReason: entry.failureReason,
    expiresAt: entry.expiresAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export async function createDirectJoinAudit(data: {
  userJid: string;
  termsAcceptedAt: Date;
  termsVersion: string;
  expiresAt: Date;
}): Promise<{ id: string }> {
  const entry = await DirectJoinAudit.create({ ...data, status: 'pending' });
  return { id: String(entry._id) };
}

export async function markDirectJoinAuditAdded(id: string, whatsappStatus: string): Promise<void> {
  await DirectJoinAudit.updateOne(
    { _id: id },
    { $set: { status: 'added', whatsappStatus }, $unset: { failureReason: 1 } },
  );
}

export async function markDirectJoinAuditFailed(id: string, data: {
  whatsappStatus?: string;
  reason: string;
}): Promise<void> {
  await DirectJoinAudit.updateOne(
    { _id: id },
    { $set: { status: 'failed', whatsappStatus: data.whatsappStatus, failureReason: data.reason } },
  );
}

export async function listRecentDirectJoinAudits(limit = 50): Promise<DirectJoinAuditRecord[]> {
  const entries = await DirectJoinAudit.find().sort({ createdAt: -1 }).limit(limit);
  return entries.map(toRecord);
}

