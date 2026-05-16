import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseAppUrlBody,
  parseTermsGateEnabledBody,
  resolveAppUrl,
} from '../src/admin-settings.ts';

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

test('parses and normalizes valid APP_URL setting bodies', () => {
  assert.equal(parseAppUrlBody({ appUrl: 'https://example.test///' }), 'https://example.test');
  assert.equal(parseAppUrlBody({ appUrl: 'http://localhost:3000/' }), 'http://localhost:3000');
});

test('rejects invalid APP_URL setting bodies', () => {
  assert.throws(
    () => parseAppUrlBody({ appUrl: '/relative' }),
    /appUrl must be an absolute http\(s\) URL/,
  );
  assert.throws(
    () => parseAppUrlBody({ appUrl: 'ftp://example.test' }),
    /appUrl must be an absolute http\(s\) URL/,
  );
  assert.throws(
    () => parseAppUrlBody({ appUrl: '' }),
    /appUrl must be an absolute http\(s\) URL/,
  );
});

test('resolves APP_URL using Mongo value before env fallback', () => {
  assert.equal(resolveAppUrl('https://mongo.test', 'https://env.test'), 'https://mongo.test');
  assert.equal(resolveAppUrl(null, 'https://env.test/'), 'https://env.test');
  assert.equal(resolveAppUrl(null, undefined), 'http://localhost:3000');
});
