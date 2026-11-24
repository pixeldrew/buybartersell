import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ListingThread } from '../src/db.ts';

test('listing threads accept media without a caption', () => {
  const thread = new ListingThread({
    groupId: '123@g.us', sender: '123@s.whatsapp.net',
    startTimestamp: new Date(), endTimestamp: new Date(),
    combinedText: '', mediaCount: 1,
  });
  assert.equal(thread.validateSync(), undefined);
});
