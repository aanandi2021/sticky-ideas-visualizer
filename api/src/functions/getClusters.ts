/**
 * GET /api/clusters — current cluster snapshot (for initial page load)
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { clustersContainer, ideasContainer } from '../lib/cosmosClient';
import type { Idea, ClusterSnapshot, TreeNode } from '../../../shared/types';

async function getClusters(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let snapshot: ClusterSnapshot | null = null;

  try {
    const { resource } = await clustersContainer().item('current', 'current').read<ClusterSnapshot>();
    snapshot = resource ?? null;
  } catch {
    // No clusters yet
  }

  if (!snapshot) {
    return {
      jsonBody: {
        treeData: { name: 'Ideas', type: 'root', desc: 'No ideas yet', children: [] },
        snapshot: null,
      },
    };
  }

  // Fetch all ideas to build the tree
  const { resources: ideas } = await ideasContainer().items
    .query<Idea>('SELECT * FROM c ORDER BY c.createdAt ASC')
    .fetchAll();

  const treeData: TreeNode = {
    name: 'Ideas',
    type: 'root',
    desc: `${ideas.length} ideas across ${snapshot.clusters.length} themes`,
    children: snapshot.clusters.map((cluster) => ({
      name: cluster.theme,
      emoji: cluster.emoji,
      type: 'theme' as const,
      color: cluster.color,
      children: cluster.ideaIds
        .map((id) => ideas.find((i) => i.id === id))
        .filter(Boolean)
        .map((idea) => ({
          name: idea!.title,
          desc: idea!.description,
          type: 'idea' as const,
        })),
    })),
  };

  return { jsonBody: { treeData, snapshot } };
}

app.http('getClusters', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'clusters',
  handler: getClusters,
});
