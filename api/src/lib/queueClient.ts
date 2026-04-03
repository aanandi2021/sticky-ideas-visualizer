import { QueueServiceClient } from '@azure/storage-queue';
import type { NewIdeaMessage, ReclusterMessage } from '../../../shared/types';

let queueService: QueueServiceClient | null = null;

function getQueueService(): QueueServiceClient {
  if (!queueService) {
    const connStr = process.env.AzureWebJobsStorage || 'UseDevelopmentStorage=true';
    queueService = QueueServiceClient.fromConnectionString(connStr);
  }
  return queueService;
}

export async function enqueueNewIdea(message: NewIdeaMessage): Promise<void> {
  const queue = getQueueService().getQueueClient('new-ideas');
  await queue.createIfNotExists();
  const encoded = Buffer.from(JSON.stringify(message)).toString('base64');
  await queue.sendMessage(encoded);
}

export async function enqueueRecluster(message: ReclusterMessage): Promise<void> {
  const queue = getQueueService().getQueueClient('recluster');
  await queue.createIfNotExists();
  const encoded = Buffer.from(JSON.stringify(message)).toString('base64');
  await queue.sendMessage(encoded, { visibilityTimeout: 30 }); // 30s debounce
}
