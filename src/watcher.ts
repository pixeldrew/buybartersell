import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { type WASocket, type proto, type WAMessage, downloadMediaMessage } from '@whiskeysockets/baileys';
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

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.remoteJid !== groupJid) continue;
      if (msg.key.fromMe) continue;

      const text = extractText(msg);
      const messageId = msg.key.id ?? `${Date.now()}-${randomUUID()}`;
      const sender    = msg.key.participant ?? msg.key.remoteJid ?? 'unknown';
      const timestamp = msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000)
        : new Date();

      (async () => {
        const mediaFiles = await downloadMedia(msg, sock);
        await saveMessage({ messageId, groupId: groupJid, sender, text, timestamp, mediaFiles });
        console.log(`[watcher] saved ${messageId}${mediaFiles.length ? ` (+${mediaFiles.length} media)` : ''}`);
      })().catch(err => console.error('[watcher] Error:', err));
    }
  });
}
