import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhoneBook, resolveSenderPhoneNumber } from '../src/watcher';

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
