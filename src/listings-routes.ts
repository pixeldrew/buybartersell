import { Router, type Request, type Response } from 'express';
import {
  getListingThreadFacetOptions,
  getListingThreadPage,
  type ListingThreadPageItem,
  type ListingThreadQuery,
} from './db.ts';

const listingsRouter = Router();

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalNumber(value: unknown, field: string): number | null {
  const raw = readOptionalString(value);
  if (raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a valid number`);
  }
  return parsed;
}

export function parseListingsQuery(query: Request['query']): ListingThreadQuery {
  const limitRaw = readOptionalString(query.limit);
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isInteger(limit) || !limit || limit < 1 || limit > 50)) {
    throw new Error('limit must be an integer between 1 and 50');
  }

  return {
    cursor: readOptionalString(query.cursor),
    limit,
    sentiment: readOptionalString(query.sentiment),
    brand: readOptionalString(query.brand),
    item: readOptionalString(query.item),
    size: readOptionalString(query.size),
    year: readOptionalString(query.year),
    priceMin: parseOptionalNumber(query.priceMin, 'priceMin'),
    priceMax: parseOptionalNumber(query.priceMax, 'priceMax'),
    currency: readOptionalString(query.currency),
    condition: readOptionalString(query.condition),
  };
}

function withMediaUrls(item: ListingThreadPageItem) {
  return {
    ...item,
    mediaFiles: item.mediaFiles.map((mediaFile) => ({
      ...mediaFile,
      url: `/media/${encodeURIComponent(mediaFile.filename)}`,
    })),
  };
}

listingsRouter.get('/', async (req: Request, res: Response) => {
  let parsedQuery: ListingThreadQuery;
  try {
    parsedQuery = parseListingsQuery(req.query);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  try {
    const page = await getListingThreadPage(parsedQuery);
    res.json({
      items: page.items.map(withMediaUrls),
      nextCursor: page.nextCursor,
    });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

listingsRouter.get('/meta', async (_req: Request, res: Response) => {
  try {
    const filters = await getListingThreadFacetOptions();
    res.json({ filters });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

export default listingsRouter;
