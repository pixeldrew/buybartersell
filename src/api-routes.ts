import { Router, type Request, type Response } from 'express';
import { sendGroupMessage, listGroups, getConnectionStatus } from './whatsapp.ts';
import { getWeeklyPostCounts, getSentimentCounts, getMarketCounts } from './db.ts';
import { resolveToken, approveRequest, rejectRequest } from './join-approval.ts';
import {
  getAppUrl,
  getTermsGateEnabled,
  parseAppUrlBody,
  parseTermsGateEnabledBody,
  setAppUrl,
  setTermsGateEnabled,
} from './admin-settings.ts';
import { createRequireAdminApi, getConfiguredAdminEmails } from './auth.ts';

const apiRouter = Router();

apiRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ connected: getConnectionStatus() });
});

apiRouter.get('/groups', async (_req: Request, res: Response) => {
  try {
    const groups = await listGroups();
    res.json({ groups });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

apiRouter.post('/send', async (req: Request, res: Response) => {
  const { groupId, message } = req.body as { groupId?: string; message?: string };

  if (!groupId || !message) {
    res.status(400).json({ error: 'groupId and message are required' });
    return;
  }

  try {
    await sendGroupMessage(groupId, message);
    res.json({ success: true, groupId, message });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

apiRouter.use('/admin', createRequireAdminApi(getConfiguredAdminEmails()));

apiRouter.get('/admin/stats', async (_req: Request, res: Response) => {
  try {
    const [weeklyPosts, sentimentCounts, marketCounts] = await Promise.all([
      getWeeklyPostCounts(),
      getSentimentCounts(),
      getMarketCounts(),
    ]);
    res.json({ weeklyPosts, sentimentCounts, marketCounts });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

apiRouter.get('/admin/settings', async (_req: Request, res: Response) => {
  try {
    const [termsGateEnabled, appUrl] = await Promise.all([
      getTermsGateEnabled(),
      getAppUrl(),
    ]);
    res.json({ termsGateEnabled, appUrl });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

apiRouter.post('/admin/settings/app-url', async (req: Request, res: Response) => {
  let appUrl: string;
  try {
    appUrl = parseAppUrlBody(req.body);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  try {
    const savedAppUrl = await setAppUrl(appUrl);
    res.json({ appUrl: savedAppUrl });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

apiRouter.post('/admin/settings/terms-gate', async (req: Request, res: Response) => {
  let enabled: boolean;
  try {
    enabled = parseTermsGateEnabledBody(req.body);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  try {
    const termsGateEnabled = await setTermsGateEnabled(enabled);
    res.json({ termsGateEnabled });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

interface JoinJsonResponse {
  status: number;
  body: {
    ok: boolean;
    error?: string;
    outcome?: 'approved' | 'declined';
  };
}

function joinTokenErrorMessage(err: unknown): { status: number; message: string } {
  const code = (err as { code?: string }).code;
  const message =
    code === 'EXPIRED' ? 'This invitation link has expired.' :
    code === 'USED'    ? 'This invitation link has already been used.' :
                         'This invitation link is invalid.';
  return { status: code === 'NOT_FOUND' ? 404 : 410, message };
}

export function getJoinTokenStatus(token: string): JoinJsonResponse {
  try {
    resolveToken(token);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    const { status, message } = joinTokenErrorMessage(err);
    return { status, body: { ok: false, error: message } };
  }
}

export async function acceptJoinToken(token: string): Promise<JoinJsonResponse> {
  try {
    await approveRequest(token);
    return { status: 200, body: { ok: true, outcome: 'approved' } };
  } catch (err) {
    const { status, message } = joinTokenErrorMessage(err);
    return { status, body: { ok: false, error: message } };
  }
}

export async function rejectJoinToken(token: string): Promise<JoinJsonResponse> {
  try {
    await rejectRequest(token);
    return { status: 200, body: { ok: true, outcome: 'declined' } };
  } catch (err) {
    const { status, message } = joinTokenErrorMessage(err);
    return { status, body: { ok: false, error: message } };
  }
}

apiRouter.get('/join/:token/status', (req: Request, res: Response) => {
  const result = getJoinTokenStatus(req.params['token'] as string);
  res.status(result.status).json(result.body);
});

apiRouter.post('/join/:token/accept', async (req: Request, res: Response) => {
  const result = await acceptJoinToken(req.params['token'] as string);
  res.status(result.status).json(result.body);
});

apiRouter.post('/join/:token/reject', async (req: Request, res: Response) => {
  const result = await rejectJoinToken(req.params['token'] as string);
  res.status(result.status).json(result.body);
});

export default apiRouter;
