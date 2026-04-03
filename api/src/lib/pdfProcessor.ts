/**
 * PDF sticky-note processor
 * Adapted from generate.js — uses Azure AI Document Intelligence for text extraction
 * and Azure OpenAI GPT-4o vision as a fallback for handwritten notes.
 */

import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer';

export interface ExtractedNote {
  text: string;
  pageNum: number;
}

/**
 * Extract text from a PDF of sticky notes using Azure AI Document Intelligence.
 * Falls back to Azure OpenAI GPT-4o vision if Document Intelligence is not configured.
 */
export async function extractNotesFromPdf(pdfBuffer: Buffer): Promise<ExtractedNote[]> {
  const diEndpoint = process.env.DOC_INTELLIGENCE_ENDPOINT;
  const diKey = process.env.DOC_INTELLIGENCE_KEY;

  if (diEndpoint && diKey) {
    return extractWithDocIntelligence(pdfBuffer, diEndpoint, diKey);
  }

  // Fallback to GPT-4o vision
  return extractWithVision(pdfBuffer);
}

async function extractWithDocIntelligence(
  pdfBuffer: Buffer,
  endpoint: string,
  key: string,
): Promise<ExtractedNote[]> {
  const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));

  const poller = await client.beginAnalyzeDocument('prebuilt-read', pdfBuffer);
  const result = await poller.pollUntilDone();

  const notes: ExtractedNote[] = [];

  if (result.pages) {
    for (const page of result.pages) {
      const lines = page.lines || [];
      const pageText = lines.map((l) => l.content).join(' ').trim();
      if (pageText) {
        notes.push({ text: pageText, pageNum: page.pageNumber });
      }
    }
  }

  return notes;
}

/**
 * Fallback: use Azure OpenAI GPT-4o vision to read sticky notes from PDF pages.
 * Sends the entire PDF as base64 (works for small PDFs; for large ones, consider splitting).
 */
async function extractWithVision(pdfBuffer: Buffer): Promise<ExtractedNote[]> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

  if (!endpoint || !apiKey) {
    throw new Error(
      'Neither DOC_INTELLIGENCE nor AZURE_OPENAI credentials are configured for PDF processing',
    );
  }

  const b64 = pdfBuffer.toString('base64');

  const body = {
    max_tokens: 4000,
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: `This PDF contains photos of sticky notes from a brainstorming session.
Read each sticky note and return a JSON array of objects: [{"text": "...", "pageNum": 1}, ...]
Each object should have the full text of one sticky note and its page number.
Return ONLY valid JSON, no markdown fences.`,
          },
          {
            type: 'image_url' as const,
            image_url: { url: `data:application/pdf;base64,${b64}`, detail: 'low' as const },
          },
        ],
      },
    ],
  };

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Azure OpenAI vision error (${resp.status}): ${errText}`);
  }

  const json = await resp.json();
  let text = json.choices[0].message.content.trim();
  text = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');

  return JSON.parse(text) as ExtractedNote[];
}

/**
 * Parse raw extracted text into title + description.
 * Ported from generate.js parseIdeas().
 */
export function parseNoteText(raw: string): { title: string; description: string } {
  const separators = [' — ', ' - ', '—'];
  for (const sep of separators) {
    const idx = raw.indexOf(sep);
    if (idx !== -1) {
      return {
        title: raw.slice(0, idx).trim(),
        description: raw.slice(idx + sep.length).trim(),
      };
    }
  }
  return {
    title: raw.slice(0, 60).trim(),
    description: raw.trim(),
  };
}
