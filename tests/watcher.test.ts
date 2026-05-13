import assert from 'node:assert/strict';
import test from 'node:test';
import { proto } from '@whiskeysockets/baileys';
import { createPhoneBook, resolveSenderPhoneNumber } from '../src/watcher';
import { collateMessagesForSave, mediaPathForStorage } from '../src/watcher';

test('resolves phone numbers from PN-style sender JIDs without metadata', () => {
  const phoneBook = createPhoneBook();

  assert.equal(resolveSenderPhoneNumber('15551234567@s.whatsapp.net', phoneBook), '15551234567');
});

test('resolves phone numbers from cached LID mappings populated by phonebook events', () => {
  const phoneBook = createPhoneBook();
  phoneBook.indexParticipant({
    id: 'abc123@lid',
    phoneNumber: '15557654321@s.whatsapp.net',
  });

  assert.equal(resolveSenderPhoneNumber('abc123@lid', phoneBook), '15557654321');
});

test('stores media paths relative to the current working directory', () => {
  assert.equal(
    mediaPathForStorage(`${process.cwd()}/media/example.jpg`),
    'media/example.jpg',
  );
});

test('collates media album children into one saved message entry', () => {
  const phoneBook = createPhoneBook();
  const messages: proto.IWebMessageInfo[] = [
    {
      key: { id: 'album-parent', remoteJid: '123@g.us', participant: '15551234567@s.whatsapp.net' },
      messageTimestamp: 1,
      message: { albumMessage: { expectedImageCount: 2 } },
    },
    {
      key: { id: 'image-1', remoteJid: '123@g.us', participant: '15551234567@s.whatsapp.net' },
      messageTimestamp: 1,
      message: {
        imageMessage: { caption: 'first caption' },
        messageContextInfo: {
          messageAssociation: {
            associationType: proto.MessageAssociation.AssociationType.MEDIA_ALBUM,
            parentMessageKey: { id: 'album-parent', remoteJid: '123@g.us' },
            messageIndex: 0,
          },
        },
      },
    },
    {
      key: { id: 'image-2', remoteJid: '123@g.us', participant: '15551234567@s.whatsapp.net' },
      messageTimestamp: 1,
      message: {
        imageMessage: { caption: 'second caption' },
        messageContextInfo: {
          messageAssociation: {
            associationType: proto.MessageAssociation.AssociationType.MEDIA_ALBUM,
            parentMessageKey: { id: 'album-parent', remoteJid: '123@g.us' },
            messageIndex: 1,
          },
        },
      },
    },
  ];

  const entries = collateMessagesForSave(messages, '123@g.us', phoneBook);

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.messageId, 'album-parent');
  assert.equal(entries[0]?.text, 'first caption\n\nsecond caption');
  assert.equal(entries[0]?.sourceMessages.length, 2);
});
