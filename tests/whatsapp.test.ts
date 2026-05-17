import assert from 'node:assert/strict';
import test from 'node:test';
import { type WASocket } from '@whiskeysockets/baileys';
import {
  createConnectedServicesStarter,
  listTrackedGroupUsers,
  removeTrackedGroupUser,
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
      { id: 'zuser@lid', phoneNumber: '15550987654@s.whatsapp.net', notify: 'Z User' },
      { id: '15551234567@s.whatsapp.net', admin: 'admin', name: 'Admin User' },
      { id: '15557654321@s.whatsapp.net', admin: 'superadmin', pushname: 'Group Owner' },
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
        displayName: 'Group Owner',
        role: 'superadmin',
      },
      {
        id: '15551234567@s.whatsapp.net',
        phoneNumber: '15551234567',
        displayName: 'Admin User',
        role: 'admin',
      },
      {
        id: '15550001111@s.whatsapp.net',
        phoneNumber: '15550001111',
        displayName: null,
        role: 'member',
      },
      {
        id: 'zuser@lid',
        phoneNumber: '15550987654',
        displayName: 'Z User',
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

test('formats tracked group users with metadata display names', async () => {
  const result = trackedGroupUsersFromMetadata({
    id: '123@g.us',
    subject: 'Tracked Group',
    participants: [{ id: '15551234567@s.whatsapp.net', verifiedName: 'Verified User' }],
  });

  assert.equal(result.participants[0]?.displayName, 'Verified User');
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

test('removes tracked group user from WATCH_GROUP_ID', async () => {
  const updates: Array<{ groupId: string; users: string[]; action: string }> = [];
  await removeTrackedGroupUser('15551234567@s.whatsapp.net', {
    isConnected: true,
    watchGroupId: '123@g.us',
    socket: {
      groupParticipantsUpdate: async (groupId: string, users: string[], action: string) => {
        updates.push({ groupId, users, action });
      },
    },
  });

  assert.deepEqual(updates, [{
    groupId: '123@g.us',
    users: ['15551234567@s.whatsapp.net'],
    action: 'remove',
  }]);
});

test('tracked group user removal requires participant id', async () => {
  await assert.rejects(
    () => removeTrackedGroupUser(' ', { isConnected: true, watchGroupId: '123@g.us', socket: { groupParticipantsUpdate: async () => undefined } }),
    /participantId is required/,
  );
});
