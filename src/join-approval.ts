import { randomBytes } from 'crypto';
import { type WASocket } from '@whiskeysockets/baileys';

interface PendingRequest {
  userJid:   string;
  groupJid:  string;
  expiresAt: Date;
  used:      boolean;
}

const pendingRequests = new Map<string, PendingRequest>();
let _sock: WASocket | null = null;

function getSock(): WASocket {
  if (!_sock) throw new Error('[join-approval] Socket not initialised');
  return _sock;
}

export function resolveToken(token: string): PendingRequest {
  const entry = pendingRequests.get(token);
  if (!entry) throw Object.assign(new Error('Token not found'), { code: 'NOT_FOUND' });
  if (entry.used) throw Object.assign(new Error('Token already used'), { code: 'USED' });
  if (entry.expiresAt < new Date()) {
    pendingRequests.delete(token);
    throw Object.assign(new Error('Token expired'), { code: 'EXPIRED' });
  }
  return entry;
}

function consumeToken(token: string): PendingRequest {
  const entry = resolveToken(token);
  entry.used = true;
  return entry;
}

export async function approveRequest(token: string): Promise<void> {
  const { userJid, groupJid } = consumeToken(token);
  await getSock().groupRequestParticipantsUpdate(groupJid, [userJid], 'approve');
  console.log(`[join-approval] Approved ${userJid} into ${groupJid}`);
}

export async function rejectRequest(token: string): Promise<void> {
  const { userJid, groupJid } = consumeToken(token);
  await getSock().groupRequestParticipantsUpdate(groupJid, [userJid], 'reject');
  console.log(`[join-approval] Rejected ${userJid} from ${groupJid}`);
}

async function handleJoinRequest(userJid: string, groupJid: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  pendingRequests.set(token, {
    userJid,
    groupJid,
    expiresAt: new Date(Date.now() + 86_400_000),
    used: false,
  });

  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const joinUrl = `${appUrl}/api/join/${token}`;

  console.log(`[join-approval] Join request from ${userJid} — sending T&C link`);

  await getSock().sendMessage(userJid, {
    text:
      `Hi! Thanks for requesting to join the group.\n\n` +
      `Please review and accept our Terms & Conditions to complete your membership:\n` +
      `${joinUrl}\n\n` +
      `This link expires in 24 hours.`,
  });
}

export function startJoinApproval(sock: WASocket): void {
  _sock = sock;

  const watchGroupId = process.env.WATCH_GROUP_ID;
  if (!watchGroupId) {
    console.log('[join-approval] WATCH_GROUP_ID not set — join approval disabled.');
    return;
  }

  const groupJid = watchGroupId.endsWith('@g.us') ? watchGroupId : `${watchGroupId}@g.us`;
  console.log(`[join-approval] Watching join requests for ${groupJid}`);

  sock.ev.on('group.join-request', (event) => {
    if (event.id !== groupJid) return;
    if (event.action !== 'created') return;
    handleJoinRequest(event.participant, groupJid).catch((err) =>
      console.error('[join-approval] Error handling join request:', err)
    );
  });
}
