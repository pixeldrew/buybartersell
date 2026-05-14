import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { type WASocket } from '@whiskeysockets/baileys';
import { createJoinRequestHandler, startJoinApproval } from '../src/join-approval';

test('join request handler ignores requests when terms gate is disabled', async () => {
  const sent: Array<{ jid: string; message: { text?: string } }> = [];
  const handler = createJoinRequestHandler({
    getTermsGateEnabled: async () => false,
    sendMessage: async (jid, message) => {
      sent.push({ jid, message });
    },
  });

  await handler('15551234567@s.whatsapp.net', '123@g.us');

  assert.deepEqual(sent, []);
});

test('join request handler sends terms link when terms gate is enabled', async () => {
  const sent: Array<{ jid: string; message: { text?: string } }> = [];
  const handler = createJoinRequestHandler({
    getTermsGateEnabled: async () => true,
    getAppUrl: async () => 'https://example.test',
    sendMessage: async (jid, message) => {
      sent.push({ jid, message });
    },
  });

  await handler('15551234567@s.whatsapp.net', '123@g.us');

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.jid, '15551234567@s.whatsapp.net');
  assert.match(sent[0]?.message.text ?? '', /https:\/\/example\.test\/api\/join\/[a-f0-9]{64}/);
});

test('startJoinApproval ignores non-created events and other groups', () => {
  const previousWatchGroupId = process.env.WATCH_GROUP_ID;
  process.env.WATCH_GROUP_ID = '123@g.us';
  const ev = new EventEmitter();
  const handled: Array<{ userJid: string; groupJid: string }> = [];
  const sock = { ev } as unknown as WASocket;

  startJoinApproval(sock, async (userJid, groupJid) => {
    handled.push({ userJid, groupJid });
  });

  ev.emit('group.join-request', {
    id: '999@g.us',
    action: 'created',
    participant: 'other@s.whatsapp.net',
  });
  ev.emit('group.join-request', {
    id: '123@g.us',
    action: 'revoked',
    participant: 'revoked@s.whatsapp.net',
  });
  ev.emit('group.join-request', {
    id: '123@g.us',
    action: 'created',
    participant: 'member@s.whatsapp.net',
  });

  assert.deepEqual(handled, [{ userJid: 'member@s.whatsapp.net', groupJid: '123@g.us' }]);
  if (previousWatchGroupId === undefined) {
    delete process.env.WATCH_GROUP_ID;
  } else {
    process.env.WATCH_GROUP_ID = previousWatchGroupId;
  }
});
