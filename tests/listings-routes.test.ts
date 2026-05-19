import assert from 'node:assert/strict';
import test from 'node:test';
import { parseListingsQuery } from '../src/listings-routes.ts';

test('parses listing query parameters', () => {
  const parsed = parseListingsQuery({
    limit: '12',
    cursor: '2026-05-18T12:00:00.000Z|abc123',
    sentiment: 'selling',
    brand: 'North',
    item: 'kite',
    size: '12m',
    year: '2025',
    priceMin: '100',
    priceMax: '900',
    currency: 'USD',
    condition: 'like new',
  });

  assert.deepEqual(parsed, {
    limit: 12,
    cursor: '2026-05-18T12:00:00.000Z|abc123',
    sentiment: 'selling',
    brand: 'North',
    item: 'kite',
    size: '12m',
    year: '2025',
    priceMin: 100,
    priceMax: 900,
    currency: 'USD',
    condition: 'like new',
  });
});

test('rejects invalid listing query parameters', () => {
  assert.throws(() => parseListingsQuery({ limit: '0' }), /limit must be an integer between 1 and 50/);
  assert.throws(() => parseListingsQuery({ priceMin: 'cheap' }), /priceMin must be a valid number/);
});
