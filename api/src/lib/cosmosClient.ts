import { CosmosClient, Container, Database } from '@azure/cosmos';

let client: CosmosClient | null = null;
let database: Database | null = null;

function getClient(): CosmosClient {
  if (!client) {
    const connectionString = process.env.COSMOS_CONNECTION_STRING;
    if (!connectionString) throw new Error('COSMOS_CONNECTION_STRING not configured');
    client = new CosmosClient(connectionString);
  }
  return client;
}

function getDatabase(): Database {
  if (!database) {
    const dbName = process.env.COSMOS_DATABASE || 'sticky-ideas';
    database = getClient().database(dbName);
  }
  return database;
}

export function ideasContainer(): Container {
  return getDatabase().container('ideas');
}

export function clustersContainer(): Container {
  return getDatabase().container('clusters');
}

export function metadataContainer(): Container {
  return getDatabase().container('metadata');
}

/** One-time setup: create database and containers if they don't exist */
export async function ensureDatabase(): Promise<void> {
  const c = getClient();
  const dbName = process.env.COSMOS_DATABASE || 'sticky-ideas';

  await c.databases.createIfNotExists({ id: dbName });
  const db = c.database(dbName);

  await db.containers.createIfNotExists({ id: 'ideas', partitionKey: '/source' });
  await db.containers.createIfNotExists({ id: 'clusters', partitionKey: '/id' });
  await db.containers.createIfNotExists({ id: 'metadata', partitionKey: '/id' });
}
