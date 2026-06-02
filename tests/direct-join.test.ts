import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DirectJoinRateLimiter,
  createDirectJoinService,
  normalizeUsPhoneNumber,
  verifyTurnstileToken,
} from '../src/direct-join.ts';

test('normalizes US phone numbers to WhatsApp JIDs', () => {
  assert.equal(normalizeUsPhoneNumber('(555) 123-4567'), '15551234567@s.whatsapp.net');
  assert.equal(normalizeUsPhoneNumber('+1 555 123 4567'), '15551234567@s.whatsapp.net');
});

test('rejects phone numbers outside the US normalization policy', () => {
  assert.throws(() => normalizeUsPhoneNumber('555-1234'), /valid US phone number/);
  assert.throws(() => normalizeUsPhoneNumber('+44 20 7946 0958'), /valid US phone number/);
});

test('rate limiter allows five attempts per IP in a rolling window', () => {
  const limiter = new DirectJoinRateLimiter({ maxAttempts: 5, windowMs: 15 * 60_000 });
  for (let index = 0; index < 5; index += 1) {
    assert.equal(limiter.consume('203.0.113.10', 1_000), true);
  }
  assert.equal(limiter.consume('203.0.113.10', 1_000), false);
  assert.equal(limiter.consume('203.0.113.10', 1_000 + 15 * 60_000), true);
});

test('verifies Turnstile tokens with Cloudflare Siteverify', async () => {
  let requestBody = '';
  const valid = await verifyTurnstileToken('captcha-token', 'secret', '203.0.113.10', async (_url, init) => {
    requestBody = String(init?.body);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });

  assert.equal(valid, true);
  assert.match(requestBody, /secret=secret/);
  assert.match(requestBody, /response=captcha-token/);
  assert.match(requestBody, /remoteip=203\.0\.113\.10/);
});

test('direct join service records a successful WhatsApp add', async () => {
  const calls: string[] = [];
  const service = createDirectJoinService({
    getDirectWebJoinEnabled: async () => true,
    getTurnstileSecretKey: () => 'secret',
    verifyTurnstile: async () => true,
    createAuditRecord: async (data) => {
      calls.push(`create:${data.userJid}`);
      return { id: 'audit-1' };
    },
    markAuditAdded: async (id, whatsappStatus) => {
      calls.push(`added:${id}:${whatsappStatus}`);
    },
    markAuditFailed: async () => undefined,
    addTrackedGroupUser: async (userJid) => {
      calls.push(`add:${userJid}`);
      return { status: '200', jid: userJid };
    },
  });

  const result = await service.submit({
    phoneNumber: '(555) 123-4567',
    acceptedTerms: true,
    turnstileToken: 'captcha-token',
    ipAddress: '203.0.113.10',
  });

  assert.deepEqual(result, { outcome: 'added' });
  assert.deepEqual(calls, [
    'create:15551234567@s.whatsapp.net',
    'add:15551234567@s.whatsapp.net',
    'added:audit-1:200',
  ]);
});

test('direct join service records WhatsApp add failures', async () => {
  const failures: Array<{ id: string; whatsappStatus?: string; reason: string }> = [];
  const service = createDirectJoinService({
    getDirectWebJoinEnabled: async () => true,
    getTurnstileSecretKey: () => 'secret',
    verifyTurnstile: async () => true,
    createAuditRecord: async () => ({ id: 'audit-1' }),
    markAuditAdded: async () => undefined,
    markAuditFailed: async (id, failure) => {
      failures.push({ id, ...failure });
    },
    addTrackedGroupUser: async () => ({ status: '403', jid: '15551234567@s.whatsapp.net' }),
  });

  await assert.rejects(
    () => service.submit({
      phoneNumber: '5551234567',
      acceptedTerms: true,
      turnstileToken: 'captcha-token',
      ipAddress: '203.0.113.10',
    }),
    /Unable to add this number/,
  );
  assert.deepEqual(failures, [{
    id: 'audit-1',
    whatsappStatus: '403',
    reason: 'WhatsApp rejected the add request.',
  }]);
});

