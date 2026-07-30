import path from 'node:path';
import type { Request } from 'express';
import { SourceExtractionError } from './sourceTypes';

const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
]);

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.markdown']);

export interface ParsedUploadFile {
  buffer: Buffer;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
}

function normalizeMime(raw: string | undefined): string {
  return raw?.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
}

function getBoundary(contentType: string | undefined): string {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (match?.[1] ?? match?.[2] ?? '').trim();
  if (!boundary) {
    throw new SourceExtractionError('INVALID_UPLOAD', 'Upload must use multipart/form-data.');
  }
  return boundary;
}

function parseContentDisposition(header: string | undefined): { name?: string; filename?: string } {
  if (!header) return {};
  const name = header.match(/(?:^|;)\s*name="([^"]*)"/i)?.[1];
  const filename = header.match(/(?:^|;)\s*filename="([^"]*)"/i)?.[1];
  return { name, filename };
}

function splitHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.split(/\r\n/)) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

function stripTrailingNewline(buffer: Buffer): Buffer {
  if (buffer.length >= 2 && buffer[buffer.length - 2] === 13 && buffer[buffer.length - 1] === 10) {
    return buffer.subarray(0, buffer.length - 2);
  }
  return buffer;
}

function readFilePart(body: Buffer, boundary: string): { buffer: Buffer; filename: string; mimeType: string } {
  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = 0;

  while (cursor < body.length) {
    const start = body.indexOf(delimiter, cursor);
    if (start < 0) break;

    let partStart = start + delimiter.length;
    if (body.subarray(partStart, partStart + 2).toString('ascii') === '--') break;
    if (body[partStart] === 13 && body[partStart + 1] === 10) partStart += 2;

    const next = body.indexOf(delimiter, partStart);
    if (next < 0) break;

    const part = stripTrailingNewline(body.subarray(partStart, next));
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd >= 0) {
      const headers = splitHeaders(part.subarray(0, headerEnd).toString('utf8'));
      const disposition = parseContentDisposition(headers['content-disposition']);
      if (disposition.name === 'file' && disposition.filename) {
        return {
          buffer: part.subarray(headerEnd + 4),
          filename: disposition.filename,
          mimeType: normalizeMime(headers['content-type']),
        };
      }
    }

    cursor = next;
  }

  throw new SourceExtractionError('INVALID_UPLOAD', 'Upload must include a file field named "file".');
}

export function sanitizeUploadFilename(filename: string): string {
  if (!filename || filename.includes('\0') || filename.includes('/') || filename.includes('\\')) {
    throw new SourceExtractionError('INVALID_UPLOAD', 'File name is invalid.');
  }
  const base = path.basename(filename);
  if (base !== filename || base === '.' || base === '..' || base.startsWith('.')) {
    throw new SourceExtractionError('INVALID_UPLOAD', 'File name is not allowed.');
  }
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 120);

  if (!cleaned || cleaned.startsWith('.') || cleaned === '..') {
    throw new SourceExtractionError('INVALID_UPLOAD', 'File name is not allowed.');
  }

  return cleaned;
}

export function validateUploadFile(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  maxBytes: number;
}): ParsedUploadFile {
  const sanitizedFilename = sanitizeUploadFilename(input.filename);
  const extension = path.extname(sanitizedFilename).toLowerCase();
  const mimeType = normalizeMime(input.mimeType);
  const sizeBytes = input.buffer.length;

  if (sizeBytes <= 0) {
    throw new SourceExtractionError('INVALID_UPLOAD', 'Uploaded file is empty.');
  }
  if (sizeBytes > input.maxBytes) {
    throw new SourceExtractionError('UPLOAD_TOO_LARGE', 'File exceeds the 20 MB upload limit.');
  }
  if (!SUPPORTED_EXTENSIONS.has(extension) && !SUPPORTED_MIMES.has(mimeType)) {
    throw new SourceExtractionError('UNSUPPORTED_MIME_TYPE', 'Supported uploads: PDF, TXT, and Markdown.');
  }

  return {
    buffer: input.buffer,
    originalFilename: input.filename,
    sanitizedFilename,
    mimeType,
    extension,
    sizeBytes,
  };
}

export async function readMultipartUploadFile(req: Request, maxBytes: number): Promise<ParsedUploadFile> {
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.toLowerCase().includes('multipart/form-data')) {
    throw new SourceExtractionError('INVALID_UPLOAD', 'Upload must use multipart/form-data.');
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes + 1024 * 1024) {
      throw new SourceExtractionError('UPLOAD_TOO_LARGE', 'File exceeds the 20 MB upload limit.');
    }
    chunks.push(buffer);
  }

  const part = readFilePart(Buffer.concat(chunks, total), getBoundary(contentType));
  return validateUploadFile({
    buffer: part.buffer,
    filename: part.filename,
    mimeType: part.mimeType,
    maxBytes,
  });
}
