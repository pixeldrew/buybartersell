import assert from 'node:assert/strict';
import test from 'node:test';
import { type WASocket } from '@whiskeysockets/baileys';
import {
  createConnectedServicesStarter,
  listTrackedGroupUsers,
  sendActivityPollToTrackedGroup,
  trackedGroupUsersFromMetadata,
} from '../src/whatsapp.ts';

test('connected services start only once after connection opens', () => {
  const socket = {} as WASocket;
  const started: WASocket[] = [];
  const startServices = createConnectedServicesStarter(socket, [
    (sock) => started.push(sock),
    (sock) => started.push(sock),
  ]);

  startServices();
  startServices();

  assert.deepEqual(started, [socket, socket]);
});

test('formats tracked group users from group metadata', () => {
  const result = trackedGroupUsersFromMetadata({
    id: '123@g.us',
    subject: 'Tracked Group',
    participants: [
      { id: 'zuser@lid' },
      { id: '15551234567@s.whatsapp.net', admin: 'admin' },
      { id: '15557654321@s.whatsapp.net', admin: 'superadmin' },
      { id: '15550001111@s.whatsapp.net' },
    ],
  });

  assert.deepEqual(result, {
    groupId: '123@g.us',
    subject: 'Tracked Group',
    participants: [
      {
        id: '15557654321@s.whatsapp.net',
        phoneNumber: '15557654321',
        role: 'superadmin',
      },
      {
        id: '15551234567@s.whatsapp.net',
        phoneNumber: '15551234567',
        role: 'admin',
      },
      {
        id: '15550001111@s.whatsapp.net',
        phoneNumber: '15550001111',
        role: 'member',
      },
      {
        id: 'zuser@lid',
        phoneNumber: null,
        role: 'member',
      },
    ],
  });
});

test('lists tracked group users for WATCH_GROUP_ID', async () => {
  let requestedGroupId: string | undefined;
  const result = await listTrackedGroupUsers({
    isConnected: true,
    watchGroupId: '123@g.us',
    socket: {
      groupMetadata: async (groupId: string) => {
        requestedGroupId = groupId;
        return {
          id: groupId,
          subject: 'Tracked Group',
          participants: [{ id: '15551234567@s.whatsapp.net' }],
        };
      },
    },
  });

  assert.equal(requestedGroupId, '123@g.us');
  assert.equal(result.subject, 'Tracked Group');
  assert.equal(result.participants.length, 1);
});

test('tracked group users require WATCH_GROUP_ID', async () => {
  await assert.rejects(
    () => listTrackedGroupUsers({ isConnected: true, watchGroupId: '' }),
    /WATCH_GROUP_ID is not configured/,
  );
});

test('tracked group users require a connected socket', async () => {
  await assert.rejects(
    () => listTrackedGroupUsers({ isConnected: false, watchGroupId: '123@g.us' }),
    /WhatsApp is not connected/,
  );
});

test('sends activity poll to WATCH_GROUP_ID', async () => {
  let sentJid: string | undefined;
  let sentContent: unknown;
  const result = await sendActivityPollToTrackedGroup('Are you active?', {
    isConnected: true,
    watchGroupId: '123@g.us',
    socket: {
      sendMessage: async (jid: string, content: unknown) => {
        sentJid = jid;
        sentContent = content;
        return { key: { id: 'poll-1' } };
      },
    },
  });

  assert.equal(sentJid, '123@g.us');
  assert.deepEqual(sentContent, {
    poll: {
      name: 'Are you active?',
      values: ["I'm active", 'Still here'],
      selectableCount: 1,
    },
  });
  assert.deepEqual(result, { groupId: '123@g.us', messageId: 'poll-1' });
});

test('activity poll sending requires a sent message id', async () => {
  await assert.rejects(
    () => sendActivityPollToTrackedGroup('Are you active?', {
      isConnected: true,
      watchGroupId: '123@g.us',
      socket: {
        sendMessage: async () => undefined,
      },
    }),
    /WhatsApp did not return a poll message id/,
  );
});
