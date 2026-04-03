/**
 * GET /api/ideas — list all ideas with optional source filter
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { ideasContainer } from '../lib/cosmosClient';
import type { Idea } from '../../../shared/types';

async function getIdeas(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const source = request.query.get('source');
  const limit = Math.min(parseInt(request.query.get('limit') || '500', 10), 1000);

  let query = 'SELECT * FROM c';
  const parameters: { name: string; value: string }[] = [];

  if (source) {
    query += ' WHERE c.source = @source';
    parameters.push({ name: '@source', value: source });
  }

  query += ' ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit';
  parameters.push({ name: '@limit', value: String(limit) });

  const { resources } = await ideasContainer().items
    .query<Idea>({ query, parameters })
    .fetchAll();

  return { jsonBody: { ideas: resources, count: resources.length } };
}

app.http('getIdeas', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ideas',
  handler: getIdeas,
});
