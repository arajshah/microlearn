export type SourceDocumentStatus = 'pending' | 'extracting' | 'ready' | 'failed';

export type SourceExtractionErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'PRIVATE_HOST'
  | 'INVALID_UPLOAD'
  | 'UPLOAD_TOO_LARGE'
  | 'DOWNLOAD_TOO_LARGE'
  | 'DOWNLOAD_TIMEOUT'
  | 'UNSUPPORTED_MIME_TYPE'
  | 'EXTRACTION_FAILED';

export const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const DOWNLOAD_TIMEOUT_MS = 20_000;
export const MAX_EXTRACTED_TEXT_CHARS = 300_000;
export const MAX_UPLOAD_EXTRACTED_TEXT_CHARS = 120_000;
export const MAX_TITLE_CHARS = 300;

export interface SourceSummary {
  charCount: number;
  wordCount: number;
  preview: string;
  detectedSections?: string[];
}

export interface SourceDocumentRow {
  id: string;
  source_type: string;
  url: string;
  normalized_url: string;
  title: string | null;
  mime_type: string | null;
  status: SourceDocumentStatus;
  extracted_text: string | null;
  summary_json: string | null;
  metadata_json: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class SourceExtractionError extends Error {
  readonly code: SourceExtractionErrorCode;

  constructor(code: SourceExtractionErrorCode, message: string) {
    super(message);
    this.name = 'SourceExtractionError';
    this.code = code;
  }
}
