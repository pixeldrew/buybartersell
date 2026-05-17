import { Router, type Request, type Response } from 'express';
import { getMarketCounts, getSentimentCounts, getWeeklyPostCounts } from './db.ts';
import { listGroups, listTrackedGroupUsers, removeTrackedGroupUser } from './whatsapp.ts';
import {
  getAppUrl,
  getTermsGateEnabled,
  parseAppUrlBody,
  parseTermsGateEnabledBody,
  setAppUrl,
  setTermsGateEnabled,
} from './admin-settings.ts';
import { createRequireAdminApi, getConfiguredAdminEmails } from './auth.ts';

const adminRouter = Router();

adminRouter.use(createRequireAdminApi(getConfiguredAdminEmails()));

adminRouter.get('/groups', async (_req: Request, res: Response) => {
  try {
    const groups = await listGroups();
    res.json({ groups });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

adminRouter.get('/tracked-group/users', async (_req: Request, res: Response) => {
  try {
    const trackedGroup = await listTrackedGroupUsers();
    res.json({ trackedGroup });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

export function parseTrackedGroupUserRemoveBody(body: unknown): { participantId: string } {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }
  const participantId = (body as { participantId?: unknown }).participantId;
  if (typeof participantId !== 'string' || !participantId.trim()) {
    throw new Error('participantId must be a non-empty string');
  }
  return { participantId: participantId.trim() };
}

adminRouter.post('/tracked-group/users/remove', async (req: Request, res: Response) => {
  let participantId: string;
  try {
    participantId = parseTrackedGroupUserRemoveBody(req.body).participantId;
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  try {
    const trackedGroup = await listTrackedGroupUsers();
    const participant = trackedGroup.participants.find((entry) => entry.id === participantId);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found in tracked group' });
      return;
    }
    if (participant.role !== 'member') {
      res.status(400).json({ error: 'Only members can be removed' });
      return;
    }
    await removeTrackedGroupUser(participantId);
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

adminRouter.get('/stats', async (_req: Request, res: Response) => {
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

adminRouter.get('/settings', async (_req: Request, res: Response) => {
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

adminRouter.post('/settings/app-url', async (req: Request, res: Response) => {
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

adminRouter.post('/settings/terms-gate', async (req: Request, res: Response) => {
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

export default adminRouter;
