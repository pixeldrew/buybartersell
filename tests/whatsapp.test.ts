import assert from 'node:assert/strict';
import test from 'node:test';
import { type WASocket } from '@whiskeysockets/baileys';
import { createConnectedServicesStarter } from '../src/whatsapp.ts';

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
