/**
 * SignalR negotiate — required for clients to connect to Azure SignalR Service
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext, input } from '@azure/functions';

const signalRInput = input.generic({
  type: 'signalRConnectionInfo',
  name: 'connectionInfo',
  hubName: 'ideas',
  connectionStringSetting: 'AZURE_SIGNALR_CONNECTION_STRING',
});

async function negotiate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const connectionInfo = context.extraInputs.get(signalRInput) as any;

  return {
    jsonBody: connectionInfo,
  };
}

app.http('negotiate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'negotiate',
  extraInputs: [signalRInput],
  handler: negotiate,
});
