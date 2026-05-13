import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTermsGateEnabledBody } from '../src/admin-settings';

test('parses valid terms gate setting bodies', () => {
  assert.equal(parseTermsGateEnabledBody({ enabled: true }), true);
  assert.equal(parseTermsGateEnabledBody({ enabled: false }), false);
});

test('rejects invalid terms gate setting bodies', () => {
  assert.throws(
    () => parseTermsGateEnabledBody({ enabled: 'true' }),
    /enabled must be a boolean/,
  );
  assert.throws(
    () => parseTermsGateEnabledBody({}),
    /enabled must be a boolean/,
  );
});
