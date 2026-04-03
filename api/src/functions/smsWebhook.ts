/**
 * SMS Webhook — receives incoming SMS from Azure Communication Services
 * and enqueues a new idea for processing.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { enqueueNewIdea } from '../lib/queueClient';

async function smsWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // Handle Azure EventGrid validation handshake
  const body = await request.json() as any;

  if (Array.isArray(body)) {
    // EventGrid subscription validation
    const first = body[0];
    if (first?.eventType === 'Microsoft.EventGrid.SubscriptionValidationEvent') {
      context.log('Handling EventGrid subscription validation');
      return {
        status: 200,
        jsonBody: { validationResponse: first.data.validationCode },
      };
    }

    // Process SMS events from Azure Communication Services
    for (const event of body) {
      if (event.eventType === 'Microsoft.Communication.SMSReceived') {
        const data = event.data;
        const messageText = data?.message?.trim();
        const from = data?.from || 'unknown';

        if (!messageText) {
          context.log(`Empty SMS from ${from}, skipping`);
          continue;
        }

        context.log(`SMS received from ${from}: ${messageText.slice(0, 80)}...`);

        await enqueueNewIdea({
          text: messageText,
          source: 'sms',
          sourceId: from,
        });
      }
    }

    return { status: 200 };
  }

  return { status: 400, body: 'Expected EventGrid event array' };
}

app.http('smsWebhook', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'webhooks/sms',
  handler: smsWebhook,
});
