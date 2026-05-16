import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  type WASocket,
  type proto,
  Browsers,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import readline from 'readline';
import P from 'pino';
import NodeCache from 'node-cache';
import { startWatcher } from './watcher.ts';
import { startJoinApproval } from './join-approval.ts';
import { useMongoAuthState } from './auth-state.ts';

const INVITE_LINK_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]+/;

const logger = P({ level: 'silent' });

const groupCache = new NodeCache({stdTTL: 600})

let sock: WASocket | null = null;
let isConnected = false;

type ConnectedServiceStarter = (sock: WASocket) => void;

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

export function createConnectedServicesStarter(
  socket: WASocket,
  starters: ConnectedServiceStarter[] = [startWatcher, startJoinApproval],
): () => void {
  let started = false;

  return () => {
    if (started) return;
    started = true;

    for (const starter of starters) {
      starter(socket);
    }
  };
}

export async function connectToWhatsApp(): Promise<void> {
  const { state, saveCreds } = await useMongoAuthState();
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
    printQRInTerminal: false,
    browser: Browsers.macOS("Safari"),
    markOnlineOnConnect: false,
  });

  // Request pairing code if not registered
  if (!state.creds.registered) {
    const phoneNumber = await prompt('Enter your WhatsApp phone number (with country code, e.g. 15551234567): ');
    const sanitized = phoneNumber.replace(/[^0-9]/g, '');
    const code = await sock.requestPairingCode(sanitized);
    console.log(`\nPairing code: ${code}\nEnter this code in WhatsApp > Linked Devices > Link a Device > Link with phone number\n`);
  }

  const startConnectedServices = createConnectedServicesStarter(sock);

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      handleIncomingMessage(msg).catch(console.error);
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      isConnected = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`Connection closed (${statusCode}). Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => connectToWhatsApp(), 3000);
      } else {
        console.log('Logged out. Clear baileys_auth records in MongoDB and restart to re-authenticate.');
      }
    } else if (connection === 'open') {
      isConnected = true;
      startConnectedServices();
      console.log('WhatsApp connected successfully.');
    }
  });
}

export function getSocket(): WASocket {
  if (!sock) throw new Error('WhatsApp socket not initialized');
  return sock;
}

export function getConnectionStatus(): boolean {
  return isConnected;
}

export async function sendGroupMessage(groupId: string, message: string): Promise<void> {
  if (!isConnected || !sock) {
    throw new Error('WhatsApp is not connected');
  }

  const jid = groupId.endsWith('@g.us') ? groupId : `${groupId}@g.us`;
  await sock.sendMessage(jid, { text: message });
}

export async function listGroups(): Promise<Array<{ id: string; subject: string; participants: number }>> {
  if (!isConnected || !sock) {
    throw new Error('WhatsApp is not connected');
  }

  const groups = await sock.groupFetchAllParticipating();
  return Object.values(groups).map(g => ({
    id: g.id,
    subject: g.subject,
    participants: g.participants.length,
  }));
}

function extractMessageText(msg: proto.IWebMessageInfo): string {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    ''
  );
}

async function handleIncomingMessage(msg: proto.IWebMessageInfo): Promise<void> {
  if (!sock || !msg.key) return;

  const groupJid = msg.key.remoteJid;
  // Only handle group messages
  if (!groupJid?.endsWith('@g.us')) return;

  const senderJid = msg.key.participant;
  if (!senderJid || msg.key.fromMe) return;

  const text = extractMessageText(msg);
  if (!INVITE_LINK_RE.test(text)) return;

  // Fetch group metadata to check roles
  const metadata = await sock.groupMetadata(groupJid);
  const sender = metadata.participants.find(p => p.id === senderJid);

  if (sender?.admin === 'admin' || sender?.admin === 'superadmin') {
    // Admins are allowed to share invite links
    return;
  }

  console.log(`[moderation] Invite link detected from ${senderJid} in ${metadata.subject}. Deleting and removing.`);

  // Delete the message
  await sock.sendMessage(groupJid, {
    delete: {
      remoteJid: groupJid,
      fromMe: false,
      id: msg.key.id ?? '',
      participant: senderJid,
    },
  });

  // Remove the user from the group
  //await sock.groupParticipantsUpdate(groupJid, [senderJid], 'remove');
}
