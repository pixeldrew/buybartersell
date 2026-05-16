import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { proto, type WASocket, type WAMessage, type GroupMetadata, type GroupParticipant, downloadMediaMessage } from '@whiskeysockets/baileys';
import { saveMessage, type IMediaFile } from './db.ts';

// ─── Media directory ──────────────────────────────────────────────────────────

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR ?? './media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function mediaPathForStorage(filePath: string): string {
  return path.relative(process.cwd(), filePath);
}

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
type PhoneBookContact = {
  id: string;
  phoneNumber?: string;
  lid?: string;
};
type CollationGroup = CollatedMessageEntry & {
  order: number;
};
type BufferedAlbum = {
  messages: Map<string, proto.IWebMessageInfo>;
  timer: ReturnType<typeof setTimeout>;
};

const MEDIA_SPECS: MediaSpec[] = [
  { check: m => !!m.imageMessage,    type: 'image',    ext: '.jpg'  },
  { check: m => !!m.videoMessage,    type: 'video',    ext: '.mp4'  },
  { check: m => !!m.audioMessage,    type: 'audio',    ext: '.ogg'  },
  { check: m => !!m.stickerMessage,  type: 'sticker',  ext: '.webp' },
  { check: m => !!m.documentMessage, type: 'document', ext: ''      },
];
const ALBUM_COLLATE_MS = Number(process.env.MEDIA_ALBUM_COLLATE_MS ?? 1500);

function hasMedia(msg: proto.IWebMessageInfo): boolean {
  const m = msg.message;
  return !!m && MEDIA_SPECS.some(spec => spec.check(m));
}

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
      files.push({ filename, type: spec.type, path: mediaPathForStorage(filePath) });
    } catch (err) {
      console.error(`[watcher] Failed to download ${spec.type}:`, (err as Error).message);
    }
  }

  return files;
}

export type PhoneBook = {
  get: (jid: string) => string | undefined;
  indexContact: (contact: PhoneBookContact) => void;
  indexParticipant: (participant: PhoneBookContact) => void;
};

function barePhoneFromJid(jid: string | undefined): string | undefined {
  if (!jid) return undefined;
  const [user, server] = jid.split('@');
  if (!user || server !== 's.whatsapp.net') return undefined;
  return /^\d+$/.test(user) ? user : undefined;
}

export function createPhoneBook(): PhoneBook {
  const entries = new Map<string, string>();

  function indexContact(contact: PhoneBookContact): void {
    const phone = barePhoneFromJid(contact.phoneNumber) ?? barePhoneFromJid(contact.id);
    if (!phone) return;

    entries.set(contact.id, phone);
    if (contact.phoneNumber) entries.set(contact.phoneNumber, phone);
    if (contact.lid) entries.set(contact.lid, phone);
  }

  return {
    get: (jid) => entries.get(jid),
    indexContact,
    indexParticipant: indexContact,
  };
}

export function resolveSenderPhoneNumber(sender: string, phoneBook: Pick<PhoneBook, 'get'>): string | null {
  return barePhoneFromJid(sender) ?? phoneBook.get(sender) ?? null;
}

export interface CollatedMessageEntry {
  messageId: string;
  groupId: string;
  sender: string;
  phoneNumber: string | null;
  text: string;
  timestamp: Date;
  links: string[];
  sourceMessages: proto.IWebMessageInfo[];
}

function timestampFromMessage(msg: proto.IWebMessageInfo): Date {
  return msg.messageTimestamp
    ? new Date(Number(msg.messageTimestamp) * 1000)
    : new Date();
}

function albumParentId(msg: proto.IWebMessageInfo): string | null {
  const association = msg.message?.messageContextInfo?.messageAssociation;
  if (
    association?.associationType === proto.MessageAssociation.AssociationType.MEDIA_ALBUM &&
    association.parentMessageKey?.id
  ) {
    return association.parentMessageKey.id;
  }

  return msg.message?.albumMessage && msg.key?.id ? msg.key.id : null;
}

function albumMessageSortIndex(msg: proto.IWebMessageInfo, fallback: number): number {
  return msg.message?.messageContextInfo?.messageAssociation?.messageIndex ?? fallback;
}

function collationKeyForMessage(
  msg: proto.IWebMessageInfo,
  groupJid: string,
): { key: string; messageId: string; sender: string; isAlbum: boolean } {
  const messageId = msg.key?.id ?? `${Date.now()}-${randomUUID()}`;
  const parentId = albumParentId(msg);
  const saveMessageId = parentId ?? messageId;
  const sender = msg.key?.participant ?? msg.key?.remoteJid ?? 'unknown';

  return {
    key: parentId
      ? `album:${groupJid}:${sender}:${saveMessageId}`
      : `message:${groupJid}:${sender}:${saveMessageId}`,
    messageId: saveMessageId,
    sender,
    isAlbum: !!parentId,
  };
}

export function collateMessagesForSave(
  messages: proto.IWebMessageInfo[],
  groupJid: string,
  phoneBook: Pick<PhoneBook, 'get'>,
): CollatedMessageEntry[] {
  const groups = new Map<string, CollationGroup>();

  messages.forEach((msg, index) => {
    if (msg.key?.remoteJid !== groupJid) return;

    const { key: groupKey, messageId, sender } = collationKeyForMessage(msg, groupJid);

    let group = groups.get(groupKey);
    if (!group) {
      group = {
        messageId,
        groupId: groupJid,
        sender,
        phoneNumber: resolveSenderPhoneNumber(sender, phoneBook),
        text: '',
        timestamp: timestampFromMessage(msg),
        links: [],
        sourceMessages: [],
        order: index,
      };
      groups.set(groupKey, group);
    }

    const text = extractText(msg).trim();
    const links = extractConversationLinks(msg);
    const carriesContent = text || links.length > 0 || hasMedia(msg);

    group.links.push(...links);
    if (carriesContent) group.sourceMessages.push(msg);
  });

  return Array.from(groups.values())
    .map((group) => {
      const uniqueLinks = Array.from(new Set(group.links));
      const sourceMessages = group.sourceMessages.sort(
        (a, b) => albumMessageSortIndex(a, 0) - albumMessageSortIndex(b, 0),
      );
      return {
        messageId: group.messageId,
        groupId: group.groupId,
        sender: group.sender,
        phoneNumber: group.phoneNumber,
        text: sourceMessages.map(msg => extractText(msg).trim()).filter(Boolean).join('\n\n'),
        timestamp: group.timestamp,
        links: uniqueLinks,
        sourceMessages,
        order: group.order,
      };
    })
    .filter(entry => entry.text || entry.links.length > 0 || entry.sourceMessages.some(hasMedia))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...entry }) => entry);
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
  const phoneBook = createPhoneBook();

  function cacheGroupMetadata(meta: GroupMetadata): void {
    groupMetadata = meta;
    meta.participants.forEach(phoneBook.indexParticipant);
    console.log(`[watcher] cached metadata for ${meta.subject} (${meta.participants.length} participants)`);
  }

  sock.groupMetadata(groupJid)
    .then(cacheGroupMetadata)
    .catch(err => console.error('[watcher] failed to fetch initial group metadata:', (err as Error).message));

  // Primary source: full metadata received during initial group sync
  sock.ev.on('groups.upsert', (groups) => {
    const meta = groups.find(g => g.id === groupJid);
    if (!meta) return;
    cacheGroupMetadata(meta);
  });

  // Incremental updates: participants added, removed, promoted, demoted
  sock.ev.on('group-participants.update', (update) => {
    if (update.id !== groupJid) return;
    update.participants.forEach(phoneBook.indexParticipant);
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
      phoneBook.indexContact(contact);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    const immediateMessages: proto.IWebMessageInfo[] = [];
    const albumBuffers = startWatcherAlbumBuffers.get(sock) ?? new Map<string, BufferedAlbum>();
    startWatcherAlbumBuffers.set(sock, albumBuffers);

    function saveEntry(entry: CollatedMessageEntry): void {
      (async () => {
        const mediaFiles = (await Promise.all(
          entry.sourceMessages.map(msg => downloadMedia(msg, sock)),
        )).flat();
        await saveMessage({
          messageId: entry.messageId,
          groupId: groupJid,
          sender: entry.sender,
          phoneNumber: entry.phoneNumber,
          text: entry.text,
          timestamp: entry.timestamp,
          mediaFiles,
          links: entry.links,
        });
        console.log(`[watcher] saved ${entry.messageId}${mediaFiles.length ? ` (+${mediaFiles.length} media)` : ''}${entry.links.length ? ` (${entry.links.length} links)` : ''}`);
      })().catch(err => console.error('[watcher] Error:', err));
    }

    function flushAlbumBuffer(key: string): void {
      const buffer = albumBuffers.get(key);
      if (!buffer) return;
      albumBuffers.delete(key);
      collateMessagesForSave(Array.from(buffer.messages.values()), groupJid, phoneBook)
        .forEach(saveEntry);
    }

    for (const msg of messages) {
      if (msg.key?.remoteJid !== groupJid) continue;

      const { key, isAlbum } = collationKeyForMessage(msg, groupJid);
      if (!isAlbum) {
        immediateMessages.push(msg);
        continue;
      }

      const existing = albumBuffers.get(key);
      if (existing) clearTimeout(existing.timer);

      const messagesById = existing?.messages ?? new Map<string, proto.IWebMessageInfo>();
      messagesById.set(msg.key?.id ?? randomUUID(), msg);
      albumBuffers.set(key, {
        messages: messagesById,
        timer: setTimeout(() => flushAlbumBuffer(key), ALBUM_COLLATE_MS),
      });
    }

    for (const entry of collateMessagesForSave(immediateMessages, groupJid, phoneBook)) {
      saveEntry(entry);
    }
  });
}

const startWatcherAlbumBuffers = new WeakMap<WASocket, Map<string, BufferedAlbum>>();
