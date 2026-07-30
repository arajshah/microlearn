import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '../db';
import { recordAuditEvent } from '../audit/auditService';
import { ApiError } from '../api/apiError';
import { ToolError } from '../mcp/repoSafety';
import { extractTextFromMarkdown, extractTextFromPdf, extractTextFromTxt } from './extractors';
import {
  downloadSource,
  extractTextFromDownload,
  inferSourceType,
} from './sourceExtractor';
import { serializeSourceDocument, type SerializedSourceDocument } from './sourceSerialization';
import { buildTextSummary, inferTitleFromText, truncateText, truncateTitle } from './sourceSummary';
import {
  MAX_UPLOAD_EXTRACTED_TEXT_CHARS,
  SourceExtractionError,
  type SourceDocumentRow,
  type SourceDocumentStatus,
} from './sourceTypes';
import { normalizeSourceUrl } from './sourceUrlSafety';
import type { ParsedUploadFile } from './uploadParser';

function now(): string {
  return new Date().toISOString();
}

function toToolError(err: SourceExtractionError): ToolError {
  if (err.code === 'INVALID_URL' || err.code === 'UNSUPPORTED_PROTOCOL' || err.code === 'PRIVATE_HOST') {
    return new ToolError('INVALID_INPUT', err.message);
  }
  return new ToolError('INVALID_INPUT', err.message);
}

export function getSourceDocumentById(db: Db, id: string): SourceDocumentRow | undefined {
  return db.prepare('SELECT * FROM source_documents WHERE id = ?').get(id) as SourceDocumentRow | undefined;
}

export function getReadySourceByNormalizedUrl(db: Db, normalizedUrl: string): SourceDocumentRow | undefined {
  return db
    .prepare("SELECT * FROM source_documents WHERE normalized_url = ? AND status = 'ready' ORDER BY updated_at DESC LIMIT 1")
    .get(normalizedUrl) as SourceDocumentRow | undefined;
}

export function listSourceDocuments(
  db: Db,
  options: { status?: SourceDocumentStatus; limit?: number } = {},
): SourceDocumentRow[] {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  if (options.status) {
    return db
      .prepare('SELECT * FROM source_documents WHERE status = ? ORDER BY updated_at DESC LIMIT ?')
      .all(options.status, limit) as SourceDocumentRow[];
  }
  return db
    .prepare('SELECT * FROM source_documents ORDER BY updated_at DESC LIMIT ?')
    .all(limit) as SourceDocumentRow[];
}

export function countSourceDocuments(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM source_documents').get() as { c: number }).c;
}

function insertPending(db: Db, input: {
  id: string;
  url: string;
  normalizedUrl: string;
  ts: string;
}): void {
  db.prepare(
    `INSERT INTO source_documents
      (id, source_type, url, normalized_url, title, mime_type, status, extracted_text, summary_json, metadata_json, error_code, error_message, created_at, updated_at)
     VALUES (@id, 'url', @url, @normalizedUrl, NULL, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, @ts, @ts)`,
  ).run(input);
}

function insertUploadPending(db: Db, input: {
  id: string;
  url: string;
  title: string;
  mimeType: string;
  metadataJson: string;
  ts: string;
}): void {
  db.prepare(
    `INSERT INTO source_documents
      (id, source_type, url, normalized_url, title, mime_type, status, extracted_text, summary_json, metadata_json, error_code, error_message, created_at, updated_at)
     VALUES (@id, 'upload', @url, @url, @title, @mimeType, 'pending', NULL, NULL, @metadataJson, NULL, NULL, @ts, @ts)`,
  ).run(input);
}

function markExtracting(db: Db, id: string): void {
  const ts = now();
  db.prepare("UPDATE source_documents SET status = 'extracting', updated_at = ?, error_code = NULL, error_message = NULL WHERE id = ?").run(
    ts,
    id,
  );
}

function markReady(
  db: Db,
  id: string,
  data: {
    title: string;
    mimeType: string;
    sourceType: string;
    extractedText: string;
    summaryJson: string;
    metadataJson: string;
  },
): SourceDocumentRow {
  const ts = now();
  db.prepare(
    `UPDATE source_documents SET
      status = 'ready',
      title = @title,
      mime_type = @mimeType,
      source_type = @sourceType,
      extracted_text = @extractedText,
      summary_json = @summaryJson,
      metadata_json = @metadataJson,
      error_code = NULL,
      error_message = NULL,
      updated_at = @ts
     WHERE id = @id`,
  ).run({ id, ts, ...data });
  return getSourceDocumentById(db, id) as SourceDocumentRow;
}

function markFailed(db: Db, id: string, code: string, message: string): SourceDocumentRow {
  const ts = now();
  db.prepare(
    `UPDATE source_documents SET status = 'failed', error_code = @code, error_message = @message, updated_at = @ts WHERE id = @id`,
  ).run({ id, code, message, ts });
  return getSourceDocumentById(db, id) as SourceDocumentRow;
}

function uploadedSourceType(file: ParsedUploadFile): string {
  if (file.extension === '.pdf' || file.mimeType === 'application/pdf') return 'upload_pdf';
  if (file.extension === '.md' || file.extension === '.markdown' || file.mimeType.includes('markdown')) {
    return 'upload_markdown';
  }
  return 'upload_text';
}

async function extractUploadedText(file: ParsedUploadFile): Promise<string> {
  if (file.extension === '.pdf' || file.mimeType === 'application/pdf') {
    return extractTextFromPdf(file.buffer);
  }
  if (file.extension === '.md' || file.extension === '.markdown' || file.mimeType.includes('markdown')) {
    return extractTextFromMarkdown(file.buffer);
  }
  return extractTextFromTxt(file.buffer);
}

async function persistUploadedFile(uploadRoot: string, storedFilename: string, buffer: Buffer): Promise<string> {
  const root = path.resolve(uploadRoot);
  const target = path.resolve(root, storedFilename);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new SourceExtractionError('INVALID_UPLOAD', 'Upload path is invalid.');
  }
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(target, buffer, { flag: 'wx' });
  return target;
}

export async function extractDocumentSource(
  db: Db,
  input: { url: string; force?: boolean; actor?: string },
): Promise<SerializedSourceDocument> {
  let normalized: { normalizedUrl: string; displayUrl: string };
  try {
    normalized = normalizeSourceUrl(input.url);
  } catch (err) {
    if (err instanceof SourceExtractionError) throw err;
    throw err;
  }

  if (!input.force) {
    const cached = getReadySourceByNormalizedUrl(db, normalized.normalizedUrl);
    if (cached) {
      return serializeSourceDocument(cached, false);
    }
  }

  const ts = now();
  const id = randomUUID();
  insertPending(db, { id, url: normalized.displayUrl, normalizedUrl: normalized.normalizedUrl, ts });
  markExtracting(db, id);

  try {
    const download = await downloadSource(normalized.normalizedUrl);
    const rawText = await extractTextFromDownload(download);
    const extractedText = truncateText(rawText);
    const summary = buildTextSummary(extractedText);
    const title = truncateTitle(download.title ?? inferTitleFromText(extractedText, download.finalUrl));
    const sourceType = inferSourceType(download.mimeType, download.finalUrl);
    const metadata = {
      finalUrl: download.finalUrl,
      byteLength: download.buffer.length,
      sourceDocumentId: id,
    };

    const row = markReady(db, id, {
      title,
      mimeType: download.mimeType,
      sourceType,
      extractedText,
      summaryJson: JSON.stringify(summary),
      metadataJson: JSON.stringify(metadata),
    });

    recordAuditEvent(db, {
      actor: input.actor ?? 'api',
      action: 'extract_document_source',
      entityType: 'source_document',
      entityId: id,
      metadata: {
        url: normalized.displayUrl,
        normalizedUrl: normalized.normalizedUrl,
        mimeType: download.mimeType,
        charCount: summary.charCount,
        wordCount: summary.wordCount,
        status: 'ready',
      },
    });

    return serializeSourceDocument(row, false);
  } catch (err) {
    const code = err instanceof SourceExtractionError ? err.code : 'EXTRACTION_FAILED';
    const message = err instanceof SourceExtractionError ? err.message : 'Extraction failed.';
    const row = markFailed(db, id, code, message);
    return serializeSourceDocument(row, false);
  }
}

export async function createUploadedSourceDocument(
  db: Db,
  input: { file: ParsedUploadFile; uploadRoot: string; actor?: string },
): Promise<SerializedSourceDocument> {
  const ts = now();
  const id = randomUUID();
  const storedFilename = `${id}-${input.file.sanitizedFilename}`;
  const uploadPath = await persistUploadedFile(input.uploadRoot, storedFilename, input.file.buffer);
  const relativeUploadPath = path.relative(process.cwd(), uploadPath);
  const title = truncateTitle(path.parse(input.file.sanitizedFilename).name || input.file.sanitizedFilename);
  const metadata = {
    originalFilename: input.file.originalFilename,
    filename: storedFilename,
    storedFilename,
    sizeBytes: input.file.sizeBytes,
    uploadPath: relativeUploadPath,
    sourceDocumentId: id,
  };
  const url = `upload://${storedFilename}`;

  insertUploadPending(db, {
    id,
    url,
    title,
    mimeType: input.file.mimeType,
    metadataJson: JSON.stringify(metadata),
    ts,
  });
  markExtracting(db, id);

  try {
    const rawText = await extractUploadedText(input.file);
    if (!rawText.trim()) {
      throw new SourceExtractionError('EXTRACTION_FAILED', 'File contained no extractable text.');
    }
    const extractedText = truncateText(rawText, MAX_UPLOAD_EXTRACTED_TEXT_CHARS);
    const summary = buildTextSummary(extractedText);
    const row = markReady(db, id, {
      title,
      mimeType: input.file.mimeType,
      sourceType: uploadedSourceType(input.file),
      extractedText,
      summaryJson: JSON.stringify(summary),
      metadataJson: JSON.stringify({
        ...metadata,
        originalCharCount: rawText.length,
        storedCharCount: extractedText.length,
      }),
    });

    recordAuditEvent(db, {
      actor: input.actor ?? 'api',
      action: 'upload_document_source',
      entityType: 'source_document',
      entityId: id,
      metadata: {
        filename: input.file.originalFilename,
        storedFilename,
        mimeType: input.file.mimeType,
        sizeBytes: input.file.sizeBytes,
        charCount: summary.charCount,
        wordCount: summary.wordCount,
        status: 'ready',
      },
    });

    return serializeSourceDocument(row, false);
  } catch (err) {
    const code = err instanceof SourceExtractionError ? err.code : 'EXTRACTION_FAILED';
    const message = err instanceof SourceExtractionError ? err.message : 'Extraction failed.';
    const row = markFailed(db, id, code, message);
    return serializeSourceDocument(row, false);
  }
}

export async function extractDocumentSourceTool(
  db: Db,
  input: { url: string; force?: boolean },
): Promise<SerializedSourceDocument> {
  try {
    return await extractDocumentSource(db, { ...input, actor: 'mcp' });
  } catch (err) {
    if (err instanceof SourceExtractionError) {
      throw toToolError(err);
    }
    if (err instanceof ApiError && err.code) {
      throw toToolError(new SourceExtractionError(err.code as never, err.message));
    }
    throw err;
  }
}

export function requireReadySource(db: Db, sourceId: string): SourceDocumentRow {
  const row = getSourceDocumentById(db, sourceId);
  if (!row) {
    throw new ToolError('NOT_FOUND', `Source document "${sourceId}" not found.`);
  }
  if (row.status !== 'ready' || !row.extracted_text) {
    throw new ToolError('SOURCE_NOT_READY', `Source "${sourceId}" is not ready (status: ${row.status}).`);
  }
  return row;
}

export function getSerializedSource(
  db: Db,
  sourceId: string,
  includeText = false,
): SerializedSourceDocument {
  const row = getSourceDocumentById(db, sourceId);
  if (!row) {
    throw new ApiError(404, `Source document "${sourceId}" not found.`, 'NOT_FOUND');
  }
  return serializeSourceDocument(row, includeText);
}

export function countSourceDocumentsForStatus(db: Db): Record<string, number> {
  const rows = db
    .prepare('SELECT status, COUNT(*) AS c FROM source_documents GROUP BY status')
    .all() as Array<{ status: string; c: number }>;
  return Object.fromEntries(rows.map((r) => [r.status, r.c]));
}
