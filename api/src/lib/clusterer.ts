/**
 * AI-powered idea clustering
 * Ported from generate.js clusterWithAI() — uses Azure OpenAI GPT-4o
 */

import type { Idea, ThemeCluster } from '../../../shared/types';

export async function clusterIdeasWithAI(ideas: Idea[]): Promise<ThemeCluster[]> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

  if (!endpoint || !apiKey) {
    return clusterByKeywords(ideas);
  }

  const prompt = `You are given a list of brainstormed ideas. Group them into 5-10 logical themes.

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

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Azure OpenAI clustering error (${resp.status}): ${errText}`);
  }

  const json = await resp.json();
  let text = json.choices[0].message.content.trim();
  text = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');

  const clusters: ThemeCluster[] = JSON.parse(text);

  // Validate that every idea is assigned
  const assignedIds = new Set(clusters.flatMap((c) => c.ideaIds));
  for (const idea of ideas) {
    if (!assignedIds.has(idea.id)) {
      // Put unassigned ideas in the last cluster
      clusters[clusters.length - 1].ideaIds.push(idea.id);
    }
  }

  return clusters;
}

/** Keyword-based fallback clustering (ported from generate.js) */
function clusterByKeywords(ideas: Idea[]): ThemeCluster[] {
  const themeDefinitions = [
    { theme: 'Transportation & Mobility', emoji: '🚗', color: '#60a5fa', keywords: ['traffic', 'parking', 'transit', 'vehicle', 'fleet', 'road', 'driving', 'bus'] },
    { theme: 'Infrastructure & Maintenance', emoji: '🏗️', color: '#fbbf24', keywords: ['water main', 'pipe', 'maintenance', 'construction', 'building', 'energy', 'infrastructure'] },
    { theme: 'Environment & Sustainability', emoji: '🌿', color: '#34d399', keywords: ['flood', 'waste', 'tree', 'climate', 'water quality', 'environment', 'green', 'recycl'] },
    { theme: 'Citizen Services', emoji: '👥', color: '#c084fc', keywords: ['chatbot', 'self-service', 'portal', 'permit', 'translation', 'accessible', 'citizen', 'resident'] },
    { theme: 'Planning & Governance', emoji: '📊', color: '#f472b6', keywords: ['budget', 'zoning', 'policy', 'land use', 'property', 'assessment', 'governance'] },
    { theme: 'Data & Analytics', emoji: '🔍', color: '#22d3ee', keywords: ['sentiment', 'analytics', 'knowledge', 'summariz', 'pattern', 'data', 'insight'] },
    { theme: 'Public Safety', emoji: '🛡️', color: '#f87171', keywords: ['emergency', 'dispatch', 'enforcement', 'inspection', 'safety', 'violation'] },
    { theme: 'General Ideas', emoji: '💡', color: '#fde68a', keywords: [] },
  ];

  const clusters: ThemeCluster[] = themeDefinitions.map((t) => ({
    theme: t.theme,
    emoji: t.emoji,
    color: t.color,
    ideaIds: [],
  }));

  const assigned = new Set<string>();

  for (const idea of ideas) {
    const text = `${idea.title} ${idea.description}`.toLowerCase();
    let placed = false;

    for (let i = 0; i < themeDefinitions.length - 1; i++) {
      if (themeDefinitions[i].keywords.some((kw) => text.includes(kw))) {
        clusters[i].ideaIds.push(idea.id);
        assigned.add(idea.id);
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters[clusters.length - 1].ideaIds.push(idea.id);
    }
  }

  return clusters.filter((c) => c.ideaIds.length > 0);
}
