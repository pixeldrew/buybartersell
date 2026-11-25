import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ListingThread, getUnanalyzedListingThreads } from '../src/db.ts';

test('selects unanalyzed listing threads regardless of age', async () => {
  const originalFind = ListingThread.find;
  let filter: unknown;
  let sort: unknown;
  ListingThread.find = ((query: unknown) => {
    filter = query;
    return {
      sort(value: unknown) {
        sort = value;
        return this;
      },
      async lean() { return []; },
    };
  }) as unknown as typeof ListingThread.find;

  try {
    await getUnanalyzedListingThreads();
    assert.deepEqual(filter, { status: 'open', analysis: null });
    assert.deepEqual(sort, { endTimestamp: 1 });
  } finally {
    ListingThread.find = originalFind;
  }
});
