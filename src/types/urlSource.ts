export type UrlRetrievalStatus =
  | 'success'
  | 'partial'
  | 'unsafe'
  | 'unsupported'
  | 'unavailable'
  | 'unknown';

export interface UrlSourceSection {
  heading: string;
  summary: string;
  keyPoints: string[];
}

export interface UrlSourceCitation {
  title?: string;
  url: string;
  startIndex?: number;
  endIndex?: number;
}

export interface ExtractedUrlSource {
  id: string;
  originalUrl: string;
  retrievedUrl: string;
  title: string;
  contentType?: string;
  summary: string;
  sections: UrlSourceSection[];
  keyConcepts: string[];
  importantTerms: string[];
  suggestedTopic: string;
  suggestedLearningGoal: string;
  sourceWarnings: string[];
  retrievalStatus: UrlRetrievalStatus;
  rawRetrievalStatus?: string;
  citations: UrlSourceCitation[];
  model: string;
  extractedAt: string;
}

export type UrlExtractionErrorCode =
  | 'INVALID_URL'
  | 'PRIVATE_URL'
  | 'UNSUPPORTED_SOURCE'
  | 'LOGIN_REQUIRED'
  | 'PAYWALL'
  | 'UNSAFE_URL'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'EMPTY_CONTENT'
  | 'UNKNOWN';

export interface UrlValidationResult {
  ok: true;
  normalized: string;
  displayUrl: string;
}

export interface UrlValidationFailure {
  ok: false;
  code: UrlExtractionErrorCode;
  message: string;
}

export type UrlValidation = UrlValidationResult | UrlValidationFailure;

export interface ExtractUrlOptions {
  forceRefresh?: boolean;
  apiKey: string;
}

export interface RoadmapSourceContext {
  sourceUrl: string;
  sourceTitle: string;
  sourceSummary: string;
  sourceSections: UrlSourceSection[];
  keyConcepts: string[];
  importantTerms: string[];
  sourceWarnings: string[];
}

export class UrlExtractionError extends Error {
  readonly code: UrlExtractionErrorCode;

  constructor(code: UrlExtractionErrorCode, message: string) {
    super(message);
    this.name = 'UrlExtractionError';
    this.code = code;
  }
}
