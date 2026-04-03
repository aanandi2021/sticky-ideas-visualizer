/**
 * processIdea — queue-triggered function that normalizes incoming ideas,
 * stores them in Cosmos DB, and triggers re-clustering.
 */
import { app, InvocationContext } from '@azure/functions';
import { ideasContainer } from '../lib/cosmosClient';
import { enqueueRecluster } from '../lib/queueClient';
import { parseNoteText } from '../lib/pdfProcessor';
import type { Idea, NewIdeaMessage } from '../../../shared/types';

async function processIdea(message: unknown, context: InvocationContext): Promise<void> {
  // Queue messages come base64 encoded; the Functions runtime decodes to string
  let parsed: NewIdeaMessage;
  if (typeof message === 'string') {
    parsed = JSON.parse(message);
  } else {
    parsed = message as NewIdeaMessage;
  }

  context.log(`Processing idea from ${parsed.source}: ${parsed.text.slice(0, 80)}...`);

  // Parse into title + description
  const { title, description } = parseNoteText(parsed.text);

  const idea: Idea = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    description,
    source: parsed.source,
    sourceId: parsed.sourceId,
    createdAt: new Date().toISOString(),
  };

  // Store in Cosmos DB
  await ideasContainer().items.create(idea);
  context.log(`Stored idea ${idea.id}: "${idea.title}"`);

  // Trigger re-clustering (with 30s visibility timeout for debouncing)
  await enqueueRecluster({
    triggeredBy: idea.id,
    timestamp: new Date().toISOString(),
  });
}

app.storageQueue('processIdea', {
  queueName: 'new-ideas',
  connection: 'AzureWebJobsStorage',
  handler: processIdea,
});
