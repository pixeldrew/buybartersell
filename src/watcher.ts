import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { type WASocket, type proto, type WAMessage, type GroupMetadata, type GroupParticipant, downloadMediaMessage } from '@whiskeysockets/baileys';
import { saveMessage, type IMediaFile } from './db';

// ─── Media directory ──────────────────────────────────────────────────────────

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR ?? './media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractText(msg: proto.IWebMessageInfo): string {
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


function extractConversationLinks(msg: proto.IWebMessageInfo): string[] {
  const m = msg.message;
  if (!m) return [];

  const contextInfo =
    m.extendedTextMessage?.contextInfo ??
    m.imageMessage?.contextInfo ??
    m.videoMessage?.contextInfo ??
    m.audioMessage?.contextInfo ??
    m.documentMessage?.contextInfo;

  if (!contextInfo?.stanzaId) return [];

  // stanzaId is the ID of the message being replied to / quoted.
  // remoteJid is the conversation it came from — included when the quoted
  // message originated in a different chat (e.g. a forwarded reply).
  const link = contextInfo.remoteJid
    ? `${contextInfo.stanzaId}@${contextInfo.remoteJid}`
    : contextInfo.stanzaId;

  return [link];
}

type MediaSpec = { check: (m: proto.IMessage) => boolean; type: string; ext: string };

const MEDIA_SPECS: MediaSpec[] = [
  { check: m => !!m.imageMessage,    type: 'image',    ext: '.jpg'  },
  { check: m => !!m.videoMessage,    type: 'video',    ext: '.mp4'  },
  { check: m => !!m.audioMessage,    type: 'audio',    ext: '.ogg'  },
  { check: m => !!m.stickerMessage,  type: 'sticker',  ext: '.webp' },
  { check: m => !!m.documentMessage, type: 'document', ext: ''      },
];

async function downloadMedia(
  msg: proto.IWebMessageInfo,
  sock: WASocket,
): Promise<IMediaFile[]> {
  const m = msg.message;
  if (!m) return [];

  const files: IMediaFile[] = [];

  for (const spec of MEDIA_SPECS) {
    if (!spec.check(m)) continue;

    try {
      const buffer = await downloadMediaMessage(
        msg as WAMessage, 'buffer', {},
      ) as Buffer;

      let ext = spec.ext;
      if (spec.type === 'document') {
        const docName = m.documentMessage?.fileName ?? '';
        ext = path.extname(docName) || '.bin';
      }

      const filename = `${randomUUID()}${ext}`;
      const filePath = path.join(MEDIA_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      files.push({ filename, type: spec.type, path: filePath });
    } catch (err) {
      console.error(`[watcher] Failed to download ${spec.type}:`, (err as Error).message);
    }
  }

  return files;
}

// ─── Watcher ──────────────────────────────────────────────────────────────────

export function startWatcher(sock: WASocket): void {
  const watchGroupId = process.env.WATCH_GROUP_ID;
  if (!watchGroupId) {
    console.log('[watcher] WATCH_GROUP_ID not set — group stats watcher disabled.');
    return;
  }

  const groupJid = watchGroupId.endsWith('@g.us') ? watchGroupId : `${watchGroupId}@g.us`;
  console.log(`[watcher] Watching group ${groupJid} for stats.`);

  // ── Group metadata cache ────────────────────────────────────────────────────
  let groupMetadata: GroupMetadata | null = null;

  // JID/LID → bare phone number  (e.g. "15551234567")
  const phoneBook = new Map<string, string>();

  function indexParticipant(p: GroupParticipant): void {
    if (!p.phoneNumber) return;
    const phone = p.phoneNumber.split('@')[0];
    phoneBook.set(p.id, phone);
    if (p.lid) phoneBook.set(p.lid, phone);
  }

  // Primary source: full metadata received during initial group sync
  sock.ev.on('groups.upsert', (groups) => {
    const meta = groups.find(g => g.id === groupJid);
    if (!meta) return;
    groupMetadata = meta;
    meta.participants.forEach(indexParticipant);
    console.log(`[watcher] cached metadata for ${meta.subject} (${meta.participants.length} participants)`);
  });

  // Incremental updates: participants added, removed, promoted, demoted
  sock.ev.on('group-participants.update', (update) => {
    if (update.id !== groupJid) return;
    update.participants.forEach(indexParticipant);
    // Reflect the change in the cached metadata if we have it
    if (groupMetadata) {
      if (update.action === 'add') {
        groupMetadata.participants.push(...update.participants.filter(
          p => !groupMetadata!.participants.some(existing => existing.id === p.id)
        ));
      } else if (update.action === 'remove') {
        const removed = new Set(update.participants.map(p => p.id));
        groupMetadata.participants = groupMetadata.participants.filter(p => !removed.has(p.id));
      } else {
        // promote / demote / modify — update admin flags in place
        for (const updated of update.participants) {
          const idx = groupMetadata.participants.findIndex(p => p.id === updated.id);
          if (idx !== -1) groupMetadata.participants[idx] = { ...groupMetadata.participants[idx], ...updated };
        }
      }
    }
  });

  // Fallback: contacts received outside of group sync (fills gaps)
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const contact of contacts) {
      if (!contact.phoneNumber) continue;
      const phone = contact.phoneNumber.split('@')[0];
      phoneBook.set(contact.id, phone);
      if (contact.lid) phoneBook.set(contact.lid, phone);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.remoteJid !== groupJid) continue;

      const text        = extractText(msg);
      const messageId   = msg.key.id ?? `${Date.now()}-${randomUUID()}`;
      const sender      = msg.key.participant ?? msg.key.remoteJid ?? 'unknown';
      const phoneNumber = phoneBook.get(sender) ?? null;
      const links       = extractConversationLinks(msg);
      const timestamp   = msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000)
        : new Date();

      (async () => {
        const mediaFiles = await downloadMedia(msg, sock);
        await saveMessage({ messageId, groupId: groupJid, sender, phoneNumber, text, timestamp, mediaFiles, links });
        console.log(`[watcher] saved ${messageId}${mediaFiles.length ? ` (+${mediaFiles.length} media)` : ''}${links.length ? ` (${links.length} links)` : ''}`);
      })().catch(err => console.error('[watcher] Error:', err));
    }
  });
}
