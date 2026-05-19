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
  messageId:   string;
  groupId:     string;
  sender:      string;
  phoneNumber: string | null;
  text:        string;
  timestamp:   Date;
  analysis:    GearAnalysis | null;
  mediaFiles:  IMediaFile[];
  links:       string[];
}

export interface IListingThread extends Document {
  groupId: string;
  sender: string;
  phoneNumber: string | null;
  displayName: string | null;
  startTimestamp: Date;
  endTimestamp: Date;
  messageIds: string[];
  combinedText: string;
  mediaCount: number;
  mediaFiles: IMediaFile[];
  links: string[];
  analysis: GearAnalysis | null;
  status: 'open' | 'analyzed';
}

export interface ListingThreadQuery {
  cursor?: string | null;
  limit?: number;
  sentiment?: string | null;
  brand?: string | null;
  item?: string | null;
  size?: string | null;
  year?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string | null;
  condition?: string | null;
}

export interface ListingThreadPageItem {
  id: string;
  groupId: string;
  sender: string;
  phoneNumber: string | null;
  displayName: string | null;
  startTimestamp: string;
  endTimestamp: string;
  messageIds: string[];
  combinedText: string;
  mediaCount: number;
  mediaFiles: IMediaFile[];
  links: string[];
  analysis: GearAnalysis;
}

export interface ListingThreadFacetOptions {
  sentiments: string[];
  brands: string[];
  items: string[];
  sizes: string[];
  years: string[];
  currencies: string[];
  conditions: string[];
  priceRange: {
    min: number | null;
    max: number | null;
  };
}

const PUBLIC_LISTINGS_LOOKBACK_MONTHS = 2;

// ─── Schema ───────────────────────────────────────────────────────────────────

const MediaFileSchema = new Schema<IMediaFile>(
  { filename: String, type: String, path: String },
  { _id: false },
);

const MessageSchema = new Schema<IMessage>({
  messageId:   { type: String, required: true, unique: true, index: true },
  groupId:     { type: String, required: true, index: true },
  sender:      { type: String, required: true },
  phoneNumber: { type: String, default: null },
  text:        { type: String, required: true },
  timestamp:   { type: Date, required: true, index: true },
  analysis:    { type: Schema.Types.Mixed, default: null },
  mediaFiles:  { type: [MediaFileSchema], default: [] },
  links:       { type: [String], default: [] },
});

export const Message: Model<IMessage> = mongoose.model<IMessage>('Message', MessageSchema);

const ListingThreadSchema = new Schema<IListingThread>({
  groupId:         { type: String, required: true, index: true },
  sender:          { type: String, required: true, index: true },
  phoneNumber:     { type: String, default: null },
  displayName:     { type: String, default: null },
  startTimestamp:  { type: Date, required: true, index: true },
  endTimestamp:    { type: Date, required: true, index: true },
  messageIds:      { type: [String], default: [] },
  combinedText:    { type: String, required: true, default: '' },
  mediaCount:      { type: Number, required: true, default: 0 },
  mediaFiles:      { type: [MediaFileSchema], default: [] },
  links:           { type: [String], default: [] },
  analysis:        { type: Schema.Types.Mixed, default: null },
  status:          { type: String, enum: ['open', 'analyzed'], required: true, default: 'open' },
}, { timestamps: true });

export const ListingThread: Model<IListingThread> = mongoose.model<IListingThread>('ListingThread', ListingThreadSchema);

// ─── Connection ───────────────────────────────────────────────────────────────

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/whatsapp-stats';
  await mongoose.connect(uri);
  console.log('MongoDB connected.');
}

// ─── Write helpers ────────────────────────────────────────────────────────────

export async function saveMessage(data: {
  messageId:    string;
  groupId:      string;
  sender:       string;
  phoneNumber?: string | null;
  text:         string;
  timestamp:    Date;
  mediaFiles?:  IMediaFile[];
  links?:       string[];
}): Promise<void> {
  const { phoneNumber, ...insertData } = data;
  await Message.updateOne(
    { messageId: data.messageId },
    {
      ...(phoneNumber ? { $set: { phoneNumber } } : {}),
      $setOnInsert: {
        ...insertData,
        analysis: null,
        mediaFiles: data.mediaFiles ?? [],
        links: data.links ?? [],
      },
    },
    { upsert: true },
  );
}

export async function updateAnalysis(
  messageId: string,
  analysis:  GearAnalysis,
): Promise<void> {
  await Message.updateOne({ messageId }, { $set: { analysis } });
}

export async function updateAnalysisForMessages(messageIds: string[], analysis: GearAnalysis): Promise<void> {
  if (!messageIds.length) return;
  await Message.updateMany({ messageId: { $in: messageIds } }, { $set: { analysis } });
}

// ─── Batch query ──────────────────────────────────────────────────────────────

export async function getUnanalyzedMessagesFromLastHour(): Promise<IMessage[]> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return Message.find({ analysis: null, timestamp: { $gte: since } }).lean() as unknown as IMessage[];
}

export async function upsertListingThreadForMessage(data: {
  groupId: string;
  sender: string;
  phoneNumber: string | null;
  displayName: string | null;
  messageId: string;
  text: string;
  timestamp: Date;
  mediaCount: number;
  mediaFiles: IMediaFile[];
  links: string[];
}): Promise<void> {
  const windowMs = Number(process.env.LISTING_THREAD_WINDOW_MS ?? 120000);
  const windowStart = new Date(data.timestamp.getTime() - windowMs);

  const existing = await ListingThread.findOne({
    groupId: data.groupId,
    sender: data.sender,
    endTimestamp: { $gte: windowStart, $lte: data.timestamp },
  }).sort({ endTimestamp: -1 });

  if (!existing) {
    await ListingThread.create({
      groupId: data.groupId,
      sender: data.sender,
      phoneNumber: data.phoneNumber,
      displayName: data.displayName,
      startTimestamp: data.timestamp,
      endTimestamp: data.timestamp,
      messageIds: [data.messageId],
      combinedText: data.text,
      mediaCount: data.mediaCount,
      mediaFiles: data.mediaFiles,
      links: data.links,
      analysis: null,
      status: 'open',
    });
    return;
  }

  if (existing.messageIds.includes(data.messageId)) return;

  const nextCombinedText = data.text
    ? [existing.combinedText, data.text].filter(Boolean).join('\n\n')
    : existing.combinedText;
  const nextLinks = Array.from(new Set([...(existing.links ?? []), ...data.links]));
  const nextMediaFiles = dedupeMediaFiles([...(existing.mediaFiles ?? []), ...data.mediaFiles]);

  existing.endTimestamp = data.timestamp > existing.endTimestamp ? data.timestamp : existing.endTimestamp;
  existing.phoneNumber = existing.phoneNumber ?? data.phoneNumber;
  existing.displayName = existing.displayName ?? data.displayName;
  existing.messageIds.push(data.messageId);
  existing.combinedText = nextCombinedText;
  existing.mediaCount += data.mediaCount;
  existing.mediaFiles = nextMediaFiles;
  existing.links = nextLinks;
  existing.analysis = null;
  existing.status = 'open';
  await existing.save();
}

export async function getUnanalyzedListingThreadsFromLastHour(): Promise<IListingThread[]> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return ListingThread
    .find({ status: 'open', analysis: null, endTimestamp: { $gte: since } })
    .sort({ endTimestamp: 1 })
    .lean() as unknown as IListingThread[];
}

export async function updateListingThreadAnalysis(
  listingThreadId: string,
  analysis: GearAnalysis,
): Promise<void> {
  await ListingThread.updateOne(
    { _id: listingThreadId },
    { $set: { analysis, status: 'analyzed' } },
  );
}

function dedupeMediaFiles(mediaFiles: IMediaFile[]): IMediaFile[] {
  const byPath = new Map<string, IMediaFile>();
  for (const mediaFile of mediaFiles) {
    byPath.set(mediaFile.path, mediaFile);
  }
  return Array.from(byPath.values());
}

function listingThreadMatch(query: ListingThreadQuery): Record<string, unknown> {
  const since = new Date();
  since.setMonth(since.getMonth() - PUBLIC_LISTINGS_LOOKBACK_MONTHS);

  const match: Record<string, unknown> = {
    status: 'analyzed',
    analysis: { $ne: null },
    endTimestamp: { $gte: since },
  };

  if (query.sentiment) match['analysis.sentiment'] = query.sentiment;
  if (query.brand) match['analysis.brand'] = query.brand;
  if (query.item) match['analysis.item'] = query.item;
  if (query.size) match['analysis.size'] = query.size;
  if (query.year) match['analysis.year'] = query.year;
  if (query.currency) match['analysis.currency'] = query.currency;
  if (query.condition) match['analysis.condition'] = query.condition;

  const priceRange: Record<string, number> = {};
  if (typeof query.priceMin === 'number') priceRange.$gte = query.priceMin;
  if (typeof query.priceMax === 'number') priceRange.$lte = query.priceMax;
  if (Object.keys(priceRange).length > 0) {
    match.$expr = {
      $and: [
        { $ne: ['$analysis.price', null] },
        { $regexMatch: { input: '$analysis.price', regex: '^[0-9]+(?:\\.[0-9]+)?$' } },
        ...(typeof query.priceMin === 'number'
          ? [{ $gte: [{ $toDouble: '$analysis.price' }, query.priceMin] }]
          : []),
        ...(typeof query.priceMax === 'number'
          ? [{ $lte: [{ $toDouble: '$analysis.price' }, query.priceMax] }]
          : []),
      ],
    };
  }

  return match;
}

function decodeListingCursor(cursor: string | null | undefined): { endTimestamp: Date; id: mongoose.Types.ObjectId } | null {
  if (!cursor) return null;
  const [endTimestampRaw, id] = cursor.split('|');
  if (!endTimestampRaw || !id || !mongoose.Types.ObjectId.isValid(id)) return null;
  const endTimestamp = new Date(endTimestampRaw);
  if (Number.isNaN(endTimestamp.getTime())) return null;
  return { endTimestamp, id: new mongoose.Types.ObjectId(id) };
}

function encodeListingCursor(item: { _id: mongoose.Types.ObjectId; endTimestamp: Date }): string {
  return `${item.endTimestamp.toISOString()}|${String(item._id)}`;
}

function toListingThreadPageItem(thread: IListingThread & { _id: mongoose.Types.ObjectId }): ListingThreadPageItem {
  return {
    id: String(thread._id),
    groupId: thread.groupId,
    sender: thread.sender,
    phoneNumber: thread.phoneNumber,
    displayName: thread.displayName,
    startTimestamp: thread.startTimestamp.toISOString(),
    endTimestamp: thread.endTimestamp.toISOString(),
    messageIds: thread.messageIds,
    combinedText: thread.combinedText,
    mediaCount: thread.mediaCount,
    mediaFiles: thread.mediaFiles ?? [],
    links: thread.links ?? [],
    analysis: thread.analysis as GearAnalysis,
  };
}

export async function getListingThreadPage(query: ListingThreadQuery): Promise<{
  items: ListingThreadPageItem[];
  nextCursor: string | null;
}> {
  const limit = Math.max(1, Math.min(query.limit ?? 24, 50));
  const match = listingThreadMatch(query);
  const decodedCursor = decodeListingCursor(query.cursor);

  if (decodedCursor) {
    match.$or = [
      { endTimestamp: { $lt: decodedCursor.endTimestamp } },
      { endTimestamp: decodedCursor.endTimestamp, _id: { $lt: decodedCursor.id } },
    ];
  }

  const threads = await ListingThread.find(match)
    .sort({ endTimestamp: -1, _id: -1 })
    .limit(limit + 1)
    .lean() as unknown as Array<IListingThread & { _id: mongoose.Types.ObjectId }>;

  const hasMore = threads.length > limit;
  const pageItems = hasMore ? threads.slice(0, limit) : threads;

  return {
    items: pageItems.map(toListingThreadPageItem),
    nextCursor: hasMore ? encodeListingCursor(pageItems[pageItems.length - 1]!) : null,
  };
}

function compactDistinct(values: Array<string | null | undefined>): string[] {
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));
}

export async function getListingThreadFacetOptions(): Promise<ListingThreadFacetOptions> {
  const match = listingThreadMatch({});

  const [
    sentiments,
    brands,
    items,
    sizes,
    years,
    currencies,
    conditions,
    priceStats,
  ] = await Promise.all([
    ListingThread.distinct('analysis.sentiment', match),
    ListingThread.distinct('analysis.brand', match),
    ListingThread.distinct('analysis.item', match),
    ListingThread.distinct('analysis.size', match),
    ListingThread.distinct('analysis.year', match),
    ListingThread.distinct('analysis.currency', match),
    ListingThread.distinct('analysis.condition', match),
    ListingThread.aggregate([
      { $match: match },
      {
        $match: {
          'analysis.price': { $type: 'string' },
        },
      },
      {
        $match: {
          $expr: {
            $regexMatch: { input: '$analysis.price', regex: '^[0-9]+(?:\\.[0-9]+)?$' },
          },
        },
      },
      {
        $group: {
          _id: null,
          min: { $min: { $toDouble: '$analysis.price' } },
          max: { $max: { $toDouble: '$analysis.price' } },
        },
      },
    ]),
  ]);

  return {
    sentiments: compactDistinct(sentiments),
    brands: compactDistinct(brands),
    items: compactDistinct(items),
    sizes: compactDistinct(sizes),
    years: compactDistinct(years),
    currencies: compactDistinct(currencies),
    conditions: compactDistinct(conditions),
    priceRange: {
      min: priceStats[0]?.min ?? null,
      max: priceStats[0]?.max ?? null,
    },
  };
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
