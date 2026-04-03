/**
 * POST /api/ideas — manually add a new idea from the web UI
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { enqueueNewIdea } from '../lib/queueClient';

interface AddIdeaBody {
  text: string;
}

async function addIdea(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const body = await request.json() as AddIdeaBody;

  if (!body?.text?.trim()) {
    return { status: 400, jsonBody: { error: 'text is required' } };
  }

  const text = body.text.trim();
  if (text.length > 2000) {
    return { status: 400, jsonBody: { error: 'text must be under 2000 characters' } };
  }

  await enqueueNewIdea({
    text,
    source: 'manual',
  });

  context.log(`Manual idea enqueued: ${text.slice(0, 80)}...`);

  return { status: 201, jsonBody: { message: 'Idea submitted for processing' } };
}

app.http('addIdea', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ideas',
  handler: addIdea,
});
