import path from 'path';
import express, { Router, type Request, type Response } from 'express';
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

const router = Router();
const ADMIN_DIST_DIR = path.resolve(process.cwd(), 'client/admin/dist');
const ADMIN_INDEX = path.join(ADMIN_DIST_DIR, 'index.html');

// GET /status - WhatsApp connection status
router.get('/api/status', (_req: Request, res: Response) => {
  res.json({ connected: getConnectionStatus() });
});

// GET /groups - List all groups the account is in
router.get('/api/groups', async (_req: Request, res: Response) => {
  try {
    const groups = await listGroups();
    res.json({ groups });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

// POST /send - Send a message to a group
// Body: { groupId: string, message: string }
router.post('/api/send', async (req: Request, res: Response) => {
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

// GET /stats - Weekly post counts, sentiment, and market breakdown
router.get('/admin/stats', async (_req: Request, res: Response) => {
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

// GET /admin/settings - Admin settings used by the dashboard
router.get('/admin/settings', async (_req: Request, res: Response) => {
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

// POST /admin/settings/app-url - Set base URL used in generated join links
router.post('/admin/settings/app-url', async (req: Request, res: Response) => {
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

// POST /admin/settings/terms-gate - Enable/disable terms approval gate
router.post('/admin/settings/terms-gate', async (req: Request, res: Response) => {
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

router.use('/admin/dashboard', express.static(ADMIN_DIST_DIR, { index: false }));
router.get('/admin/dashboard', (_req: Request, res: Response) => {
  res.sendFile(ADMIN_INDEX);
});

// GET /join/:token - T&C acceptance page
router.get('/join/:token', (req: Request, res: Response) => {
  const token = req.params['token'] as string;
  try {
    resolveToken(token);
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message =
      code === 'EXPIRED' ? 'This invitation link has expired.' :
      code === 'USED'    ? 'This invitation link has already been used.' :
                           'This invitation link is invalid.';
    res.status(410).setHeader('Content-Type', 'text/html').send(errorPage(message));
    return;
  }
  res.setHeader('Content-Type', 'text/html').send(termsPage(token));
});

// POST /join/:token/accept
router.post('/join/:token/accept', async (req: Request, res: Response) => {
  const token = req.params['token'] as string;
  try {
    await approveRequest(token);
    res.setHeader('Content-Type', 'text/html').send(confirmationPage('approved'));
  } catch (err) {
    const code = (err as { code?: string }).code;
    res.status(code === 'NOT_FOUND' ? 404 : 410).json({ ok: false, error: (err as Error).message });
  }
});

// POST /join/:token/reject
router.post('/join/:token/reject', async (req: Request, res: Response) => {
  const token = req.params['token'] as string;
  try {
    await rejectRequest(token);
    res.setHeader('Content-Type', 'text/html').send(confirmationPage('declined'));
  } catch (err) {
    const code = (err as { code?: string }).code;
    res.status(code === 'NOT_FOUND' ? 404 : 410).json({ ok: false, error: (err as Error).message });
  }
});

export default router;

// ── HTML helpers ──────────────────────────────────────────────────────────────

function termsPage(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Group Membership — Terms &amp; Conditions</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; padding: 2rem; }
    .card { background: #1e293b; border-radius: 0.75rem; padding: 2rem;
            max-width: 560px; width: 100%; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .terms { background: #0f172a; border-radius: 0.5rem; padding: 1rem;
             font-size: 0.875rem; color: #94a3b8; line-height: 1.6;
             max-height: 280px; overflow-y: auto; margin-bottom: 1.5rem; }
    .terms h2 { color: #e2e8f0; font-size: 0.9rem; margin-bottom: 0.75rem; }
    .terms p  { margin-bottom: 0.75rem; }
    .actions { display: flex; gap: 1rem; }
    .actions form { flex: 1; display: flex; }
    button { flex: 1; padding: 0.75rem; border: none; border-radius: 0.5rem;
             font-size: 1rem; cursor: pointer; font-weight: 600; }
    .accept  { background: #6366f1; color: #fff; }
    .accept:hover  { background: #4f46e5; }
    .decline { background: #334155; color: #e2e8f0; }
    .decline:hover { background: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Group Membership</h1>
    <p class="subtitle">Please read and accept the Terms &amp; Conditions to join.</p>
    <div class="terms">
      <h2>Terms &amp; Conditions</h2>
      <p>By joining this group you agree to treat all members with respect and courtesy.</p>
      <p>Spam, self-promotion, and unsolicited commercial messages are prohibited.</p>
      <p>Off-topic content and invite links shared without admin approval will be removed.</p>
      <p>Members who repeatedly violate these rules will be removed from the group.</p>
      <p>The administrators reserve the right to update these terms at any time.</p>
    </div>
    <div class="actions">
      <form method="POST" action="/api/join/${token}/accept">
        <button class="accept" type="submit">Accept &amp; Join</button>
      </form>
      <form method="POST" action="/api/join/${token}/reject">
        <button class="decline" type="submit">Decline</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}

function confirmationPage(outcome: 'approved' | 'declined'): string {
  const approved = outcome === 'approved';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${approved ? 'Welcome!' : 'Request Declined'}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1e293b; border-radius: 0.75rem; padding: 2.5rem 2rem;
            max-width: 400px; width: 100%; text-align: center; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p  { color: #94a3b8; font-size: 0.875rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${approved ? '✅' : '👋'}</div>
    <h1>${approved ? "You're in!" : 'Request Declined'}</h1>
    <p>${approved
      ? 'Your request has been approved. You should receive a WhatsApp notification shortly.'
      : 'You have declined the terms. You can request to join again at any time.'
    }</p>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invalid Link</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1e293b; border-radius: 0.75rem; padding: 2.5rem 2rem;
            max-width: 400px; width: 100%; text-align: center; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p  { color: #94a3b8; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Link Unavailable</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
