import type { SourceDocumentRow, SourceSummary } from './sourceTypes';

export interface SerializedSourceDocument {
  id: string;
  url: string;
  normalizedUrl: string;
  sourceType: string;
  title?: string;
  mimeType?: string;
  status: string;
  summary?: SourceSummary;
  metadata?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  extractedText?: string;
  createdAt: string;
  updatedAt: string;
}

export function parseSummary(json: string | null): SourceSummary | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as SourceSummary;
  } catch {
    return undefined;
  }
}

export function parseMetadata(json: string | null): Record<string, unknown> | undefined {
  if (!json) return undefined;
  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    return value;
  } catch {
    return undefined;
  }
}

export function serializeSourceDocument(
  row: SourceDocumentRow,
  includeText = false,
): SerializedSourceDocument {
  const doc: SerializedSourceDocument = {
    id: row.id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    sourceType: row.source_type,
    title: row.title ?? undefined,
    mimeType: row.mime_type ?? undefined,
    status: row.status,
    summary: parseSummary(row.summary_json),
    metadata: parseMetadata(row.metadata_json),
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeText && row.extracted_text) {
    doc.extractedText = row.extracted_text;
  }
  return doc;
}
