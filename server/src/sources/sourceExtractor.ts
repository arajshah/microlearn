import {
  DOWNLOAD_TIMEOUT_MS,
  MAX_DOWNLOAD_BYTES,
  SourceExtractionError,
} from './sourceTypes';
import { assertPublicHost } from './sourceUrlSafety';

export interface DownloadResult {
  buffer: Buffer;
  mimeType: string;
  title?: string;
  finalUrl: string;
}

const TEXT_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/markdown',
]);

const HTML_MIMES = new Set(['text/html', 'application/xhtml+xml']);

function mimeFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  return null;
}

function normalizeMime(raw: string | null): string {
  if (!raw) return 'application/octet-stream';
  return raw.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
}

function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  return match[1].replace(/\s+/g, ' ').trim();
}

export function stripHtmlToText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|section|article|li|h[1-6])>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text?.trim() ?? '';
  } catch {
    throw new SourceExtractionError('EXTRACTION_FAILED', 'Could not extract text from PDF.');
  }
}

export async function downloadSource(url: string): Promise<DownloadResult> {
  await assertPublicHost(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/pdf,text/plain,text/markdown,*/*;q=0.8',
        'User-Agent': 'Microlearn-SourceExtractor/1.0',
      },
    });

    if (!res.ok) {
      throw new SourceExtractionError('EXTRACTION_FAILED', `Download failed with status ${res.status}.`);
    }

    const contentLength = Number(res.headers.get('content-length') ?? '0');
    if (contentLength > MAX_DOWNLOAD_BYTES) {
      throw new SourceExtractionError('DOWNLOAD_TOO_LARGE', 'Document exceeds the 15 MB download limit.');
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new SourceExtractionError('DOWNLOAD_TOO_LARGE', 'Document exceeds the 15 MB download limit.');
    }

    const mimeType =
      normalizeMime(res.headers.get('content-type')) || mimeFromUrl(url) || 'application/octet-stream';
    const buffer = Buffer.from(arrayBuffer);
    const finalUrl = res.url || url;

    let title: string | undefined;
    if (HTML_MIMES.has(mimeType)) {
      title = extractHtmlTitle(buffer.toString('utf8'));
    }

    return { buffer, mimeType, title, finalUrl };
  } catch (err) {
    if (err instanceof SourceExtractionError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SourceExtractionError('DOWNLOAD_TIMEOUT', 'Download timed out after 20 seconds.');
    }
    const detail =
      err instanceof Error && err.message.trim().length > 0
        ? err.message.trim()
        : 'Could not download document.';
    throw new SourceExtractionError('EXTRACTION_FAILED', detail.slice(0, 240));
  } finally {
    clearTimeout(timer);
  }
}

export async function extractTextFromDownload(result: DownloadResult): Promise<string> {
  const { buffer, mimeType } = result;
  const urlMime = mimeFromUrl(result.finalUrl);
  const effectiveMime = mimeType === 'application/octet-stream' && urlMime ? urlMime : mimeType;

  if (TEXT_MIMES.has(effectiveMime)) {
    return buffer.toString('utf8');
  }

  if (HTML_MIMES.has(effectiveMime)) {
    const text = stripHtmlToText(buffer.toString('utf8'));
    if (!text.trim()) {
      throw new SourceExtractionError('EXTRACTION_FAILED', 'Could not extract readable text from HTML.');
    }
    return text;
  }

  if (effectiveMime === 'application/pdf' || result.finalUrl.toLowerCase().includes('.pdf')) {
    const text = await parsePdf(buffer);
    if (!text.trim()) {
      throw new SourceExtractionError('EXTRACTION_FAILED', 'PDF contained no extractable text.');
    }
    return text;
  }

  throw new SourceExtractionError(
    'UNSUPPORTED_MIME_TYPE',
    `Unsupported content type "${effectiveMime}". Supported: PDF, plain text, markdown, HTML.`,
  );
}

export function inferSourceType(mimeType: string, url: string): string {
  if (mimeType === 'application/pdf' || url.includes('arxiv.org/pdf')) return 'pdf';
  if (TEXT_MIMES.has(mimeType)) return 'text';
  if (HTML_MIMES.has(mimeType)) return 'html';
  return 'document';
}
