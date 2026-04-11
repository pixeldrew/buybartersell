import mongoose, { Schema, Document, Model } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GearAnalysis {
  brand:     string | null;
  item:      string | null;
  size:      string | null;
  year:      string | null;
  price:     string | null;
  currency:  string | null;
  condition: string | null;
  sentiment: 'selling' | 'wanted' | 'info' | 'unrelated';
}

export interface IMediaFile {
  filename: string;
  type:     string;
  path:     string;
}

export interface IMessage extends Document {
  messageId:  string;
  groupId:    string;
  sender:     string;
  text:       string;
  timestamp:  Date;
  analysis:   GearAnalysis | null;
  mediaFiles: IMediaFile[];
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const MessageSchema = new Schema<IMessage>({
  messageId:  { type: String, required: true, unique: true, index: true },
  groupId:    { type: String, required: true, index: true },
  sender:     { type: String, required: true },
  text:       { type: String, required: true },
  timestamp:  { type: Date, required: true, index: true },
  analysis:   { type: Schema.Types.Mixed, default: null },
  mediaFiles: { type: [{ filename: String, type: String, path: String }], default: [] },
});

export const Message: Model<IMessage> = mongoose.model<IMessage>('Message', MessageSchema);

// ─── Connection ───────────────────────────────────────────────────────────────

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/whatsapp-stats';
  await mongoose.connect(uri);
  console.log('MongoDB connected.');
}

// ─── Write helpers ────────────────────────────────────────────────────────────

export async function saveMessage(data: {
  messageId:   string;
  groupId:     string;
  sender:      string;
  text:        string;
  timestamp:   Date;
  mediaFiles?: IMediaFile[];
}): Promise<void> {
  await Message.updateOne(
    { messageId: data.messageId },
    { $setOnInsert: { ...data, analysis: null, mediaFiles: data.mediaFiles ?? [] } },
    { upsert: true },
  );
}

export async function updateAnalysis(
  messageId: string,
  analysis:  GearAnalysis,
): Promise<void> {
  await Message.updateOne({ messageId }, { $set: { analysis } });
}

// ─── Batch query ──────────────────────────────────────────────────────────────

export async function getUnanalyzedMessagesFromLastHour(): Promise<IMessage[]> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return Message.find({ analysis: null, timestamp: { $gte: since } }).lean() as unknown as IMessage[];
}

// ─── Stats queries ────────────────────────────────────────────────────────────

export async function getWeeklyPostCounts(): Promise<Array<{ date: string; count: number }>> {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const results = await Message.aggregate([
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const map = new Map(results.map((r: { _id: string; count: number }) => [r._id, r.count]));
  const days: Array<{ date: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: (map.get(key) as number) ?? 0 });
  }
  return days;
}

export async function getSentimentCounts(): Promise<Record<string, number>> {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const results = await Message.aggregate([
    { $match: { timestamp: { $gte: since }, 'analysis.sentiment': { $ne: null } } },
    { $group: { _id: '$analysis.sentiment', count: { $sum: 1 } } },
  ]);

  const counts: Record<string, number> = { selling: 0, wanted: 0, info: 0, unrelated: 0 };
  for (const r of results as Array<{ _id: string; count: number }>) {
    if (r._id) counts[r._id] = r.count;
  }
  return counts;
}

export async function getMarketCounts(): Promise<{ selling: number; wanted: number }> {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const results = await Message.aggregate([
    {
      $match: {
        timestamp: { $gte: since },
        'analysis.sentiment': { $in: ['selling', 'wanted'] },
      },
    },
    { $group: { _id: '$analysis.sentiment', count: { $sum: 1 } } },
  ]);

  const counts = { selling: 0, wanted: 0 };
  for (const r of results as Array<{ _id: string; count: number }>) {
    if (r._id === 'selling') counts.selling = r.count;
    if (r._id === 'wanted')  counts.wanted  = r.count;
  }
  return counts;
}
