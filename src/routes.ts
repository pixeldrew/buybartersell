import { Router, type Request, type Response } from 'express';
import { sendGroupMessage, listGroups, getConnectionStatus } from './whatsapp';
import { getWeeklyPostCounts, getSentimentCounts, getMarketCounts } from './db';

const router = Router();

// GET /status - WhatsApp connection status
router.get('/status', (_req: Request, res: Response) => {
  res.json({ connected: getConnectionStatus() });
});

// GET /groups - List all groups the account is in
router.get('/groups', async (_req: Request, res: Response) => {
  try {
    const groups = await listGroups();
    res.json({ groups });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

// POST /send - Send a message to a group
// Body: { groupId: string, message: string }
router.post('/send', async (req: Request, res: Response) => {
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
router.get('/stats', async (_req: Request, res: Response) => {
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

// GET /dashboard - HTML stats dashboard
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const [weeklyPosts, sentimentCounts, marketCounts] = await Promise.all([
      getWeeklyPostCounts(),
      getSentimentCounts(),
      getMarketCounts(),
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
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    .card { background: #1e293b; border-radius: 0.75rem; padding: 1.5rem; }
    .card h2 { font-size: 1rem; color: #94a3b8; margin-bottom: 1rem; }
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
  <h1>WhatsApp Group Stats</h1>
  <p class="subtitle">Watching: ${watchedGroup} &mdash; auto-refreshes every 60s</p>

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

export default router;