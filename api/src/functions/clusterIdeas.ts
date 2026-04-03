/**
 * clusterIdeas — queue-triggered function that re-clusters all ideas
 * using Azure OpenAI and broadcasts the result via SignalR.
 *
 * The queue message has a 30-second visibility timeout (set by processIdea),
 * which acts as a natural debounce — multiple rapid ideas result in a single
 * clustering run after the window closes.
 */
import { app, InvocationContext, output } from '@azure/functions';
import { ideasContainer, clustersContainer } from '../lib/cosmosClient';
import { clusterIdeasWithAI } from '../lib/clusterer';
import type { Idea, ClusterSnapshot, TreeNode } from '../../../shared/types';

// SignalR output binding
const signalROutput = output.generic({
  type: 'signalR',
  name: 'signalRMessages',
  hubName: 'ideas',
  connectionStringSetting: 'AZURE_SIGNALR_CONNECTION_STRING',
});

async function clusterIdeas(message: unknown, context: InvocationContext): Promise<void> {
  context.log('Re-clustering all ideas...');

  // Fetch all ideas from Cosmos DB
  const { resources: ideas } = await ideasContainer().items
    .query<Idea>('SELECT * FROM c ORDER BY c.createdAt ASC')
    .fetchAll();

  if (ideas.length === 0) {
    context.log('No ideas to cluster');
    return;
  }

  context.log(`Clustering ${ideas.length} ideas...`);

  // Run AI clustering
  const clusters = await clusterIdeasWithAI(ideas);

  // Save the cluster snapshot
  const snapshot: ClusterSnapshot = {
    id: 'current',
    clusters,
    ideaCount: ideas.length,
    updatedAt: new Date().toISOString(),
  };

  await clustersContainer().items.upsert(snapshot);
  context.log(`Saved ${clusters.length} clusters`);

  // Build tree data for the frontend
  const treeData: TreeNode = {
    name: 'Ideas',
    type: 'root',
    desc: `${ideas.length} ideas across ${clusters.length} themes`,
    children: clusters.map((cluster) => ({
      name: cluster.theme,
      emoji: cluster.emoji,
      type: 'theme' as const,
      color: cluster.color,
      children: cluster.ideaIds
        .map((id) => ideas.find((i: Idea) => i.id === id))
        .filter(Boolean)
        .map((idea) => ({
          name: idea!.title,
          desc: idea!.description,
          type: 'idea' as const,
        })),
    })),
  };

  // Broadcast to all connected SignalR clients
  context.extraOutputs.set(signalROutput, [{
    target: 'clustersUpdated',
    arguments: [{ treeData, snapshot }],
  }]);

  context.log('Cluster update broadcast via SignalR');
}

app.storageQueue('clusterIdeas', {
  queueName: 'recluster',
  connection: 'AzureWebJobsStorage',
  handler: clusterIdeas,
  extraOutputs: [signalROutput],
});
