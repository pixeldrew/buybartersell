import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTrackedGroupUserRemoveBody } from '../src/admin-routes.ts';

test('parses tracked group user remove request body', () => {
  assert.deepEqual(
    parseTrackedGroupUserRemoveBody({ participantId: ' 15551234567@s.whatsapp.net ' }),
    { participantId: '15551234567@s.whatsapp.net' },
  );
});

test('rejects invalid tracked group user remove body', () => {
  assert.throws(() => parseTrackedGroupUserRemoveBody(null), /Request body must be an object/);
  assert.throws(() => parseTrackedGroupUserRemoveBody({ participantId: '' }), /participantId must be a non-empty string/);
});
