import type { ListingFiltersMeta, ListingQueryState, ListingThread } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Request failed with HTTP ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

function queryStringFromFilters(filters: ListingQueryState, cursor?: string | null): string {
  const params = new URLSearchParams();
  const entries = Object.entries(filters) as Array<[keyof ListingQueryState, string]>;

  for (const [key, value] of entries) {
    if (value.trim()) params.set(key, value.trim());
  }

  if (cursor) params.set('cursor', cursor);
  params.set('limit', '18');
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export function getListings(filters: ListingQueryState, cursor?: string | null): Promise<{
  items: ListingThread[];
  nextCursor: string | null;
}> {
  return requestJson(`/api/listings${queryStringFromFilters(filters, cursor)}`);
}

export function getListingFiltersMeta(): Promise<{ filters: ListingFiltersMeta }> {
  return requestJson('/api/listings/meta');
}
