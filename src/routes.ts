import { Router, type Request, type Response } from 'express';
import { sendGroupMessage, listGroups, getConnectionStatus } from './whatsapp';
import { getWeeklyPostCounts, getSentimentCounts, getMarketCounts } from './db';
import { resolveToken, approveRequest, rejectRequest } from './join-approval';
import {
  getTermsGateEnabled,
  parseTermsGateEnabledBody,
  setTermsGateEnabled,
} from './admin-settings';

const router = Router();

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
    const termsGateEnabled = await getTermsGateEnabled();
    res.json({ termsGateEnabled });
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

// GET /dashboard - HTML stats dashboard
router.get('/admin/dashboard', async (_req: Request, res: Response) => {
  try {
    const [weeklyPosts, sentimentCounts, marketCounts, termsGateEnabled] = await Promise.all([
      getWeeklyPostCounts(),
      getSentimentCounts(),
      getMarketCounts(),
      getTermsGateEnabled(),
    ]);

    const labels = JSON.stringify(weeklyPosts.map(d => d.date));
    const postData = JSON.stringify(weeklyPosts.map(d => d.count));
    const sentimentLabels = JSON.stringify(Object.keys(sentimentCounts));
    const sentimentData = JSON.stringify(Object.values(sentimentCounts));
    const watchedGroup = process.env.WATCH_GROUP_ID ?? '(not configured)';

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="60">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Group Stats</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 2rem; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 2rem; }
    .topbar .subtitle { margin-bottom: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    .card { background: #1e293b; border-radius: 0.75rem; padding: 1.5rem; }
    .card h2 { font-size: 1rem; color: #94a3b8; margin-bottom: 1rem; }
    .gate-control { display: flex; align-items: center; gap: 0.75rem; background: #1e293b; border-radius: 0.5rem; padding: 0.75rem 1rem; }
    .gate-label { font-size: 0.875rem; color: #cbd5e1; }
    .gate-error { color: #f87171; font-size: 0.75rem; min-height: 1rem; }
    .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; inset: 0; background: #475569; transition: 0.2s; border-radius: 999px; }
    .slider::before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; transition: 0.2s; border-radius: 50%; }
    .switch input:checked + .slider { background: #6366f1; }
    .switch input:checked + .slider::before { transform: translateX(20px); }
    .stat-row { display: flex; gap: 1rem; }
    .stat { flex: 1; background: #0f172a; border-radius: 0.5rem; padding: 1rem; text-align: center; }
    .stat .value { font-size: 2rem; font-weight: 700; }
    .stat .label { font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem; }
    .selling .value { color: #f97316; }
    .buying .value { color: #38bdf8; }
    canvas { max-height: 220px; }
  </style>
</head>
<body>
  <div class="topbar">
    <div>
      <h1>WhatsApp Group Stats</h1>
      <p class="subtitle">Watching: ${watchedGroup} &mdash; auto-refreshes every 60s</p>
    </div>
    <div class="gate-control">
      <span class="gate-label">Terms Gate</span>
      <label class="switch" title="Enable terms approval for join requests">
        <input id="termsGateToggle" type="checkbox" ${termsGateEnabled ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
      <span id="termsGateState" class="gate-label">${termsGateEnabled ? 'Enabled' : 'Disabled'}</span>
      <span id="termsGateError" class="gate-error"></span>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Posts — last 7 days</h2>
      <canvas id="postsChart"></canvas>
    </div>

    <div class="card">
      <h2>Sentiment — last 7 days</h2>
      <canvas id="sentimentChart"></canvas>
    </div>

    <div class="card">
      <h2>Gear Market — last 7 days</h2>
      <div class="stat-row">
        <div class="stat selling">
          <div class="value">${marketCounts.selling}</div>
          <div class="label">Selling</div>
        </div>
        <div class="stat buying">
          <div class="value">${marketCounts.wanted}</div>
          <div class="label">Wanted</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const termsGateToggle = document.getElementById('termsGateToggle');
    const termsGateState = document.getElementById('termsGateState');
    const termsGateError = document.getElementById('termsGateError');

    termsGateToggle.addEventListener('change', async () => {
      const enabled = termsGateToggle.checked;
      termsGateToggle.disabled = true;
      termsGateError.textContent = '';

      try {
        const response = await fetch('/admin/settings/terms-gate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });

        if (!response.ok) throw new Error('Unable to save setting');

        const data = await response.json();
        termsGateToggle.checked = data.termsGateEnabled;
        termsGateState.textContent = data.termsGateEnabled ? 'Enabled' : 'Disabled';
      } catch (err) {
        termsGateToggle.checked = !enabled;
        termsGateError.textContent = 'Save failed';
      } finally {
        termsGateToggle.disabled = false;
      }
    });

    new Chart(document.getElementById('postsChart'), {
      type: 'bar',
      data: {
        labels: ${labels},
        datasets: [{ label: 'Posts', data: ${postData}, backgroundColor: '#6366f1', borderRadius: 4 }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } } }
    });

    new Chart(document.getElementById('sentimentChart'), {
      type: 'doughnut',
      data: {
        labels: ${sentimentLabels},
        datasets: [{ data: ${sentimentData}, backgroundColor: ['#22c55e', '#ef4444', '#94a3b8'] }]
      },
      options: { plugins: { legend: { labels: { color: '#e2e8f0' } } } }
    });
  </script>
</body>
</html>`);
  } catch (err) {
    res.status(503).send(`<pre>Error: ${(err as Error).message}</pre>`);
  }
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
