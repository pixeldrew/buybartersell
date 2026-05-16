import assert from 'node:assert/strict';
import test from 'node:test';
import { type WASocket } from '@whiskeysockets/baileys';
import { createJoinRequestHandler, startJoinApproval } from '../src/join-approval.ts';
import { acceptJoinToken, getJoinTokenStatus, rejectJoinToken } from '../src/join-routes.ts';
import { stubJoinRequestStore } from './join-request-store-stub.ts';

async function createToken(): Promise<string> {
  const sent: Array<{ message: { text?: string } }> = [];
  const handler = createJoinRequestHandler({
    getTermsGateEnabled: async () => true,
    getAppUrl: async () => 'http://localhost:3000',
    sendMessage: async (_jid, message) => {
      sent.push({ message });
    },
  });

  await handler('15551234567@s.whatsapp.net', '123@g.us');
  const match = sent[0]?.message.text?.match(/\/join\/([a-f0-9]{64})/);
  assert.ok(match);
  return match[1] as string;
}

test('join status returns ok for a valid token', async () => {
  const { restore } = stubJoinRequestStore();
  try {
    const token = await createToken();

    assert.deepEqual(await getJoinTokenStatus(token), { status: 200, body: { ok: true } });
  } finally {
    restore();
  }
});

test('join status returns json errors for unavailable tokens', async () => {
  const { restore } = stubJoinRequestStore();
  try {
    assert.deepEqual(await getJoinTokenStatus('not-a-token'), {
      status: 404,
      body: {
        ok: false,
        error: 'This invitation link is invalid.',
      },
    });
  } finally {
    restore();
  }
});

test('join accept and reject endpoints return json outcomes', async () => {
  const previousWatchGroupId = process.env.WATCH_GROUP_ID;
  process.env.WATCH_GROUP_ID = '123@g.us';
  const updates: Array<{ groupJid: string; users: string[]; action: string }> = [];
  const sock = {
    ev: { on: () => undefined },
    groupRequestParticipantsUpdate: async (groupJid: string, users: string[], action: string) => {
      updates.push({ groupJid, users, action });
    },
  } as unknown as WASocket;
  startJoinApproval(sock, async () => undefined);
  const { restore } = stubJoinRequestStore();

  try {
    const acceptToken = await createToken();
    const rejectToken = await createToken();

    assert.deepEqual(await acceptJoinToken(acceptToken), {
      status: 200,
      body: { ok: true, outcome: 'approved' },
    });
    assert.deepEqual(await rejectJoinToken(rejectToken), {
      status: 200,
      body: { ok: true, outcome: 'declined' },
    });
  } finally {
    restore();
    if (previousWatchGroupId === undefined) {
      delete process.env.WATCH_GROUP_ID;
    } else {
      process.env.WATCH_GROUP_ID = previousWatchGroupId;
    }
  }

  assert.deepEqual(
    updates.map((entry) => entry.action),
    ['approve', 'reject'],
  );
});
