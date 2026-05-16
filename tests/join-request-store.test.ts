import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createJoinRequest,
  markJoinRequestUsed,
  resolveJoinRequestToken,
} from '../src/join-request-store.ts';
import { type StoredJoinRequest, stubJoinRequestStore } from './join-request-store-stub.ts';

test('creates and resolves pending join requests through the Mongo model', async () => {
  const records = new Map<string, StoredJoinRequest>();
  const { restore } = stubJoinRequestStore(records);
  try {
    await createJoinRequest({
      token: 'abc123',
      userJid: '15551234567@s.whatsapp.net',
      groupJid: '123@g.us',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const request = await resolveJoinRequestToken('abc123');

    assert.equal(request.userJid, '15551234567@s.whatsapp.net');
    assert.equal(request.groupJid, '123@g.us');
    assert.equal(request.used, false);
  } finally {
    restore();
  }
});

test('marks join request tokens used without deleting the record', async () => {
  const records = new Map<string, StoredJoinRequest>([
    ['used-token', {
      token: 'used-token',
      userJid: '15551234567@s.whatsapp.net',
      groupJid: '123@g.us',
      expiresAt: new Date(Date.now() + 60_000),
      used: false,
    }],
  ]);
  const { restore } = stubJoinRequestStore(records);
  try {
    const request = await markJoinRequestUsed('used-token');

    assert.equal(request.token, 'used-token');
    assert.equal(records.get('used-token')?.used, true);
  } finally {
    restore();
  }
});

test('deletes expired unused join request tokens when resolved', async () => {
  const records = new Map<string, StoredJoinRequest>([
    ['expired-token', {
      token: 'expired-token',
      userJid: '15551234567@s.whatsapp.net',
      groupJid: '123@g.us',
      expiresAt: new Date(Date.now() - 60_000),
      used: false,
    }],
  ]);
  const { restore } = stubJoinRequestStore(records);
  try {
    await assert.rejects(
      () => resolveJoinRequestToken('expired-token'),
      (err: unknown) => (err as { code?: string }).code === 'EXPIRED',
    );
    assert.equal(records.has('expired-token'), false);
  } finally {
    restore();
  }
});
