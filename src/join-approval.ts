import { randomBytes } from 'crypto';
import { type WASocket } from '@whiskeysockets/baileys';
import { getAppUrl, getTermsGateEnabled } from './admin-settings.ts';

interface PendingRequest {
  userJid:   string;
  groupJid:  string;
  expiresAt: Date;
  used:      boolean;
}

const pendingRequests = new Map<string, PendingRequest>();
let _sock: WASocket | null = null;

type JoinRequestHandler = (userJid: string, groupJid: string) => Promise<void>;

interface JoinRequestHandlerDeps {
  getTermsGateEnabled: () => Promise<boolean>;
  sendMessage: (jid: string, message: { text: string }) => Promise<unknown>;
  getAppUrl?: () => Promise<string>;
}

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

export function createJoinRequestHandler(deps: JoinRequestHandlerDeps): JoinRequestHandler {
  return async (userJid: string, groupJid: string): Promise<void> => {
    const termsGateEnabled = await deps.getTermsGateEnabled();
    if (!termsGateEnabled) {
      console.log(`[join-approval] Terms gate disabled — ignoring join request from ${userJid}`);
      return;
    }

    const token = randomBytes(32).toString('hex');
    pendingRequests.set(token, {
      userJid,
      groupJid,
      expiresAt: new Date(Date.now() + 86_400_000),
      used: false,
    });

    const appUrl = await (deps.getAppUrl ?? getAppUrl)();
    const joinUrl = `${appUrl}/join/${token}`;

    console.log(`[join-approval] Join request from ${userJid} — sending T&C link`);

    await deps.sendMessage(userJid, {
      text:
        `Hi! Thanks for requesting to join the group.\n\n` +
        `Please review and accept our Terms & Conditions to complete your membership:\n` +
        `${joinUrl}\n\n` +
        `This link expires in 24 hours.`,
    });
  };
}

export function startJoinApproval(sock: WASocket, handleJoinRequest?: JoinRequestHandler): void {
  _sock = sock;

  const watchGroupId = process.env.WATCH_GROUP_ID;
  if (!watchGroupId) {
    console.log('[join-approval] WATCH_GROUP_ID not set — join approval disabled.');
    return;
  }

  const groupJid = watchGroupId.endsWith('@g.us') ? watchGroupId : `${watchGroupId}@g.us`;
  console.log(`[join-approval] Watching join requests for ${groupJid}`);

  const handler = handleJoinRequest ?? createJoinRequestHandler({
    getTermsGateEnabled,
    sendMessage: (jid, message) => getSock().sendMessage(jid, message),
  });

  sock.ev.on('group.join-request', (event) => {
    if (event.id !== groupJid) return;
    if (event.action !== 'created') return;
    handler(event.participant, groupJid).catch((err) =>
      console.error('[join-approval] Error handling join request:', err)
    );
  });
}
