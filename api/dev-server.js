/**
 * Local development server — replaces Azure Functions + Cosmos DB + SignalR + Azure OpenAI
 * Uses: Express, local JSON file, GitHub Models API (Copilot), Server-Sent Events
 *
 * Usage:
 *   set GITHUB_TOKEN=ghp_your_token_here
 *   node dev-server.js
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ── Config ──
const PORT = 7071;
const DATA_FILE = path.join(__dirname, '.dev-data.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_MODELS_URL = 'https://models.inference.ai.azure.com/chat/completions';
const MODEL = process.env.GITHUB_MODEL || 'gpt-4o';

// ── SSE clients (replaces SignalR) ──
const sseClients = new Set();

app.get('/api/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(eventName, data) {
  const payload = `data: ${JSON.stringify({ type: eventName, ...data })}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// ── Local JSON storage (replaces Cosmos DB) ──
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return { ideas: [], clusters: [], updatedAt: null };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Parse idea text into title + description ──
function parseNoteText(raw) {
  const separators = [' — ', ' - ', '—'];
  for (const sep of separators) {
    const idx = raw.indexOf(sep);
    if (idx !== -1) {
      return { title: raw.slice(0, idx).trim(), description: raw.slice(idx + sep.length).trim() };
    }
  }
  return { title: raw.slice(0, 60).trim(), description: raw.trim() };
}

// ── Build tree data from ideas + clusters ──
function buildTreeData(ideas, clusters) {
  return {
    name: 'Ideas',
    type: 'root',
    desc: `${ideas.length} ideas across ${clusters.length} themes`,
    children: clusters.map((cluster) => ({
      name: cluster.theme,
      emoji: cluster.emoji,
      type: 'theme',
      color: cluster.color,
      children: cluster.ideaIds
        .map((id) => ideas.find((i) => i.id === id))
        .filter(Boolean)
        .map((idea) => ({
          name: idea.title,
          desc: idea.description,
          type: 'idea',
        })),
    })),
  };
}

// ── AI Clustering via GitHub Models API ──
async function clusterWithGitHub(ideas) {
  if (!GITHUB_TOKEN) {
    console.log('  ⚠ No GITHUB_TOKEN set — using keyword fallback clustering');
    return clusterByKeywords(ideas);
  }

  console.log(`  🧠 Clustering ${ideas.length} ideas via GitHub Models (${MODEL})...`);

  const prompt = `You are given a list of brainstormed ideas. Group them into 3-8 logical themes.

Return ONLY valid JSON in this exact format (no markdown, no code fences):
[
  {
    "theme": "Theme Name",
    "emoji": "🔍",
    "color": "#22d3ee",
    "ideaIds": ["id1", "id3", "id7"]
  }
]

The "ideaIds" array contains the id values from the list below. Use visually distinct hex colors.
Every idea must appear in exactly one theme.

IDEAS:
${ideas.map((idea) => `- id="${idea.id}" title="${idea.title}" desc="${idea.description}"`).join('\n')}`;

  try {
    const resp = await fetch(GITHUB_MODELS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`  ✗ GitHub Models error (${resp.status}): ${errText}`);
      return clusterByKeywords(ideas);
    }

    const json = await resp.json();
    let text = json.choices[0].message.content.trim();
    text = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    const clusters = JSON.parse(text);

    // Validate every idea is assigned
    const assignedIds = new Set(clusters.flatMap((c) => c.ideaIds));
    for (const idea of ideas) {
      if (!assignedIds.has(idea.id)) {
        clusters[clusters.length - 1].ideaIds.push(idea.id);
      }
    }

    console.log(`  ✓ ${clusters.length} themes identified`);
    return clusters;
  } catch (err) {
    console.error(`  ✗ Clustering failed: ${err.message}`);
    return clusterByKeywords(ideas);
  }
}

function clusterByKeywords(ideas) {
  console.log('  🔤 Using keyword fallback clustering...');
  const defs = [
    { theme: 'Transportation & Mobility', emoji: '🚗', color: '#60a5fa', keywords: ['traffic', 'parking', 'transit', 'vehicle', 'road', 'bus'] },
    { theme: 'Infrastructure', emoji: '🏗️', color: '#fbbf24', keywords: ['water', 'pipe', 'maintenance', 'construction', 'building', 'energy'] },
    { theme: 'Environment', emoji: '🌿', color: '#34d399', keywords: ['flood', 'waste', 'tree', 'climate', 'green', 'recycl'] },
    { theme: 'Citizen Services', emoji: '👥', color: '#c084fc', keywords: ['chatbot', 'portal', 'permit', 'citizen', 'resident', 'service'] },
    { theme: 'Data & Analytics', emoji: '🔍', color: '#22d3ee', keywords: ['data', 'analytics', 'ai', 'smart', 'sensor', 'pattern'] },
    { theme: 'General Ideas', emoji: '💡', color: '#fde68a', keywords: [] },
  ];

  const clusters = defs.map((d) => ({ theme: d.theme, emoji: d.emoji, color: d.color, ideaIds: [], _kw: d.keywords }));
  for (const idea of ideas) {
    const text = `${idea.title} ${idea.description}`.toLowerCase();
    let placed = false;
    for (let i = 0; i < clusters.length - 1; i++) {
      if (clusters[i]._kw.some((kw) => text.includes(kw))) {
        clusters[i].ideaIds.push(idea.id);
        placed = true;
        break;
      }
    }
    if (!placed) clusters[clusters.length - 1].ideaIds.push(idea.id);
  }
  const result = clusters.filter((c) => c.ideaIds.length > 0).map(({ _kw, ...rest }) => rest);
  console.log(`  ✓ ${result.length} themes (keyword)`);
  return result;
}

// Debounce re-clustering
let clusterTimer = null;
function scheduleRecluster() {
  if (clusterTimer) clearTimeout(clusterTimer);
  clusterTimer = setTimeout(async () => {
    const data = loadData();
    if (data.ideas.length === 0) return;
    console.log('\n🎯 Re-clustering...');
    data.clusters = await clusterWithGitHub(data.ideas);
    data.updatedAt = new Date().toISOString();
    saveData(data);

    const treeData = buildTreeData(data.ideas, data.clusters);
    const snapshot = { id: 'current', clusters: data.clusters, ideaCount: data.ideas.length, updatedAt: data.updatedAt };
    broadcast('clustersUpdated', { treeData, snapshot });
    console.log('📡 Broadcast to', sseClients.size, 'client(s)\n');
  }, 2000); // 2s debounce
}

// ═══════════════════════════════════════════
//  REST API endpoints
// ═══════════════════════════════════════════

// GET /api/clusters — initial load
app.get('/api/clusters', (req, res) => {
  const data = loadData();
  const treeData = buildTreeData(data.ideas, data.clusters);
  const snapshot = data.clusters.length > 0
    ? { id: 'current', clusters: data.clusters, ideaCount: data.ideas.length, updatedAt: data.updatedAt }
    : null;
  res.json({ treeData, snapshot });
});

// GET /api/ideas — list all ideas
app.get('/api/ideas', (req, res) => {
  const data = loadData();
  res.json({ ideas: data.ideas, count: data.ideas.length });
});

// POST /api/ideas — add an idea
app.post('/api/ideas', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: 'text must be under 2000 characters' });
  }

  const { title, description } = parseNoteText(text.trim());
  const idea = {
    id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    title,
    description,
    source: 'manual',
    createdAt: new Date().toISOString(),
  };

  const data = loadData();
  data.ideas.push(idea);
  saveData(data);
  console.log(`✅ Idea added: "${idea.title}" (${data.ideas.length} total)`);

  scheduleRecluster();
  res.status(201).json({ message: 'Idea submitted for processing', idea });
});

// POST /api/webhooks/sms — simulate SMS
app.post('/api/webhooks/sms', (req, res) => {
  const events = req.body;
  if (!Array.isArray(events)) return res.status(400).json({ error: 'Expected array' });

  const data = loadData();
  for (const event of events) {
    if (event.eventType === 'Microsoft.Communication.SMSReceived') {
      const msg = event.data?.message?.trim();
      const from = event.data?.from || 'unknown';
      if (!msg) continue;

      const { title, description } = parseNoteText(msg);
      const idea = {
        id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        title, description, source: 'sms', sourceId: from,
        createdAt: new Date().toISOString(),
      };
      data.ideas.push(idea);
      console.log(`📱 SMS idea from ${from}: "${idea.title}"`);
    }
  }
  saveData(data);
  scheduleRecluster();
  res.json({ ok: true });
});

// POST /api/negotiate — SignalR negotiate (returns empty for local dev)
app.post('/api/negotiate', (_req, res) => {
  res.json({ url: '', accessToken: '' });
});

// ═══════════════════════════════════════════
//  Start
// ═══════════════════════════════════════════
app.listen(PORT, () => {
  const data = loadData();
  console.log(`
╔══════════════════════════════════════════════╗
║   🎨 Sticky Ideas — Local Dev Server        ║
╠══════════════════════════════════════════════╣
║   API:    http://localhost:${PORT}/api          ║
║   SSE:    http://localhost:${PORT}/api/sse       ║
║   Ideas:  ${String(data.ideas.length).padEnd(4)} stored locally             ║
║   AI:     ${GITHUB_TOKEN ? 'GitHub Models (' + MODEL + ')' : 'Keyword fallback (no token)'}${GITHUB_TOKEN ? '' : '  '}  ║
╚══════════════════════════════════════════════╝

${GITHUB_TOKEN ? '✓ GITHUB_TOKEN detected — AI clustering enabled' : '⚠ Set GITHUB_TOKEN for AI-powered clustering:\n  $env:GITHUB_TOKEN = "ghp_your_token"\n  node dev-server.js'}
`);
});
