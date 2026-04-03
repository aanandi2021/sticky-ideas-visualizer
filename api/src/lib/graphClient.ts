import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import 'isomorphic-fetch';

let graphClient: Client | null = null;

export function getGraphClient(): Client {
  if (!graphClient) {
    const tenantId = process.env.GRAPH_TENANT_ID;
    const clientId = process.env.GRAPH_CLIENT_ID;
    const clientSecret = process.env.GRAPH_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('GRAPH_TENANT_ID, GRAPH_CLIENT_ID, and GRAPH_CLIENT_SECRET must be set');
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });

    graphClient = Client.initWithMiddleware({ authProvider });
  }
  return graphClient;
}

/** Download a file from OneDrive by item ID */
export async function downloadDriveItem(itemId: string): Promise<Buffer> {
  const client = getGraphClient();
  const stream = await client.api(`/me/drive/items/${itemId}/content`).getStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Fetch new emails from a specific folder */
export async function getNewEmails(folderId: string, since: string): Promise<Array<{ id: string; subject: string; body: string; from: string }>> {
  const client = getGraphClient();
  const response = await client
    .api(`/me/mailFolders/${folderId}/messages`)
    .filter(`receivedDateTime ge ${since}`)
    .select('id,subject,body,from')
    .orderby('receivedDateTime desc')
    .top(50)
    .get();

  return (response.value || []).map((msg: any) => ({
    id: msg.id,
    subject: msg.subject || '',
    body: msg.body?.content || '',
    from: msg.from?.emailAddress?.address || 'unknown',
  }));
}

/** Delta query for OneDrive folder changes */
export async function getDriveChanges(folderPath: string, deltaToken?: string): Promise<{
  items: Array<{ id: string; name: string; mimeType: string }>;
  nextDeltaToken: string;
}> {
  const client = getGraphClient();
  const encodedPath = encodeURIComponent(folderPath);

  let url: string;
  if (deltaToken) {
    url = deltaToken; // delta tokens are full URLs
  } else {
    url = `/me/drive/root:${encodedPath}:/delta`;
  }

  const items: Array<{ id: string; name: string; mimeType: string }> = [];
  let nextLink: string | undefined = url;
  let nextDelta = '';

  while (nextLink) {
    const response = await client.api(nextLink).get();

    for (const item of response.value || []) {
      if (item.file && item.name) {
        items.push({
          id: item.id,
          name: item.name,
          mimeType: item.file.mimeType || '',
        });
      }
    }

    nextLink = response['@odata.nextLink'];
    if (response['@odata.deltaLink']) {
      nextDelta = response['@odata.deltaLink'];
    }
  }

  return { items, nextDeltaToken: nextDelta };
}
