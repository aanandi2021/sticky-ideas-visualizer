/**
 * Email Webhook — receives Microsoft Graph change notifications
 * for new emails, fetches the email body, and enqueues ideas.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { enqueueNewIdea } from '../lib/queueClient';
import { getGraphClient } from '../lib/graphClient';

async function emailWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // Handle Graph subscription validation
  const validationToken = request.query.get('validationToken');
  if (validationToken) {
    context.log('Handling Graph subscription validation');
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: validationToken };
  }

  const body = await request.json() as any;
  const notifications = body?.value;

  if (!Array.isArray(notifications)) {
    return { status: 202 };
  }

  const client = getGraphClient();

  for (const notification of notifications) {
    const resourceUrl = notification.resource;
    if (!resourceUrl) continue;

    try {
      const message = await client.api(`/${resourceUrl}`).select('id,subject,body,from').get();
      const subject = message.subject || '';
      const bodyContent = message.body?.content || '';
      const from = message.from?.emailAddress?.address || 'unknown';

      // Strip HTML tags for plain text extraction
      const plainText = bodyContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const ideaText = subject ? `${subject} — ${plainText}` : plainText;

      if (!ideaText.trim()) {
        context.log(`Empty email from ${from}, skipping`);
        continue;
      }

      context.log(`Email from ${from}: ${ideaText.slice(0, 80)}...`);

      await enqueueNewIdea({
        text: ideaText,
        source: 'email',
        sourceId: from,
      });
    } catch (err: any) {
      context.error(`Failed to process email notification: ${err.message}`);
    }
  }

  return { status: 202 };
}

app.http('emailWebhook', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'webhooks/email',
  handler: emailWebhook,
});
