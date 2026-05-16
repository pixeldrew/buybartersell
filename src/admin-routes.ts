import { Router, type Request, type Response } from 'express';
import { getMarketCounts, getSentimentCounts, getWeeklyPostCounts } from './db.ts';
import { listGroups } from './whatsapp.ts';
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
