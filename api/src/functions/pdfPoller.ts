/**
 * PDF Poller — runs every 15 minutes, checks OneDrive for new PDFs,
 * extracts sticky notes, and enqueues ideas.
 */
import { app, InvocationContext, Timer } from '@azure/functions';
import { getDriveChanges, downloadDriveItem } from '../lib/graphClient';
import { extractNotesFromPdf, parseNoteText } from '../lib/pdfProcessor';
import { enqueueNewIdea } from '../lib/queueClient';
import { metadataContainer } from '../lib/cosmosClient';

const METADATA_ID = 'onedrive-delta-token';

async function pdfPoller(timer: Timer, context: InvocationContext): Promise<void> {
  context.log('PDF poller triggered');

  const folderPath = process.env.ONEDRIVE_FOLDER_PATH || '/StickyNotes';

  // Load last delta token from Cosmos DB
  let deltaToken: string | undefined;
  try {
    const { resource } = await metadataContainer().item(METADATA_ID, METADATA_ID).read();
    deltaToken = resource?.deltaToken;
  } catch {
    context.log('No previous delta token found, doing full scan');
  }

  // Get changes since last poll
  const { items, nextDeltaToken } = await getDriveChanges(folderPath, deltaToken);

  // Filter to PDFs only
  const pdfs = items.filter(
    (item) => item.name.toLowerCase().endsWith('.pdf') || item.mimeType === 'application/pdf',
  );

  context.log(`Found ${pdfs.length} new/changed PDFs out of ${items.length} total changes`);

  for (const pdf of pdfs) {
    try {
      context.log(`Processing PDF: ${pdf.name}`);

      // Download the PDF
      const pdfBuffer = await downloadDriveItem(pdf.id);

      // Extract sticky notes
      const notes = await extractNotesFromPdf(pdfBuffer);
      context.log(`Extracted ${notes.length} notes from ${pdf.name}`);

      // Enqueue each note as an idea
      for (const note of notes) {
        const parsed = parseNoteText(note.text);
        await enqueueNewIdea({
          text: `${parsed.title} — ${parsed.description}`,
          source: 'pdf',
          sourceId: pdf.name,
        });
      }
    } catch (err: any) {
      context.error(`Failed to process PDF ${pdf.name}: ${err.message}`);
    }
  }

  // Persist the delta token for next run
  if (nextDeltaToken) {
    await metadataContainer().items.upsert({
      id: METADATA_ID,
      deltaToken: nextDeltaToken,
      updatedAt: new Date().toISOString(),
    });
  }

  context.log('PDF poller complete');
}

app.timer('pdfPoller', {
  schedule: '0 */15 * * * *', // every 15 minutes
  handler: pdfPoller,
});
