import {
  ExtractedUrlSource,
  UrlSourceCitation,
  UrlRetrievalStatus,
} from '@/types/urlSource';

interface InteractionTextBlock {
  type?: string;
  text?: string;
  annotations?: Array<Record<string, unknown>>;
}

interface InteractionStep {
  type?: string;
  content?: InteractionTextBlock[];
  result?: Record<string, unknown>;
  output?: InteractionTextBlock[];
}

interface InteractionResponse {
  steps?: InteractionStep[];
  outputs?: InteractionStep[];
  usage?: Record<string, unknown>;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function collectTextBlocks(step: InteractionStep): InteractionTextBlock[] {
  if (Array.isArray(step.content)) return step.content;
  if (Array.isArray(step.output)) return step.output;
  return [];
}

function parseCitation(raw: Record<string, unknown>): UrlSourceCitation | null {
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!url) return null;
  return {
    url,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    startIndex: typeof raw.start_index === 'number' ? raw.start_index : undefined,
    endIndex: typeof raw.end_index === 'number' ? raw.end_index : undefined,
  };
}

function extractCitationsFromSteps(steps: InteractionStep[]): UrlSourceCitation[] {
  const citations: UrlSourceCitation[] = [];
  for (const step of steps) {
    if (step.type !== 'model_output') continue;
    for (const block of collectTextBlocks(step)) {
      if (!Array.isArray(block.annotations)) continue;
      for (const ann of block.annotations) {
        const rec = asRecord(ann);
        if (!rec || rec.type !== 'url_citation') continue;
        const c = parseCitation(rec);
        if (c) citations.push(c);
      }
    }
  }
  return citations;
}

function extractModelOutputText(steps: InteractionStep[]): string | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type !== 'model_output') continue;
    const parts = collectTextBlocks(step)
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string);
    if (parts.length > 0) return parts.join('\n').trim();
  }
  return null;
}

function extractUrlContextMeta(steps: InteractionStep[]): {
  retrievalStatus?: string;
  retrievedUrl?: string;
} {
  let retrievalStatus: string | undefined;
  let retrievedUrl: string | undefined;

  for (const step of steps) {
    const type = step.type ?? '';
    if (!type.includes('url_context')) continue;
    const result = asRecord(step.result) ?? asRecord(step);
    if (!result) continue;

    const metadata = Array.isArray(result.url_metadata)
      ? result.url_metadata
      : Array.isArray(result.urlMetadata)
        ? result.urlMetadata
        : null;

    if (metadata) {
      for (const item of metadata) {
        const rec = asRecord(item);
        if (!rec) continue;
        retrievalStatus =
          (typeof rec.url_retrieval_status === 'string' && rec.url_retrieval_status) ||
          (typeof rec.retrieval_status === 'string' && rec.retrieval_status) ||
          retrievalStatus;
        retrievedUrl =
          (typeof rec.retrieved_url === 'string' && rec.retrieved_url) ||
          (typeof rec.retrievedUrl === 'string' && rec.retrievedUrl) ||
          retrievedUrl;
      }
    }

    if (typeof result.url_retrieval_status === 'string') {
      retrievalStatus = result.url_retrieval_status;
    }
    if (typeof result.retrieved_url === 'string') {
      retrievedUrl = result.retrieved_url;
    }
  }

  return { retrievalStatus, retrievedUrl };
}

export interface ParsedInteraction {
  modelOutputText: string;
  citations: UrlSourceCitation[];
  retrievalStatus: UrlRetrievalStatus;
  rawRetrievalStatus?: string;
  retrievedUrl?: string;
  tokenUsage?: Record<string, unknown>;
}

export function parseInteractionsResponse(body: unknown): ParsedInteraction {
  const resp = (body ?? {}) as InteractionResponse;
  const steps = Array.isArray(resp.steps)
    ? resp.steps
    : Array.isArray(resp.outputs)
      ? resp.outputs
      : [];

  const modelOutputText = extractModelOutputText(steps);
  if (!modelOutputText) {
    throw new Error('MALFORMED_RESPONSE');
  }

  const { retrievalStatus: rawStatus, retrievedUrl } = extractUrlContextMeta(steps);
  const citations = extractCitationsFromSteps(steps);

  let retrievalStatus: UrlRetrievalStatus = 'unknown';
  if (rawStatus) {
    const lower = rawStatus.toLowerCase();
    if (lower.includes('unsafe')) retrievalStatus = 'unsafe';
    else if (lower.includes('unsupported')) retrievalStatus = 'unsupported';
    else if (lower.includes('unavailable') || lower.includes('not_found')) {
      retrievalStatus = 'unavailable';
    } else if (lower.includes('partial')) retrievalStatus = 'partial';
    else if (lower.includes('success')) retrievalStatus = 'success';
  }

  return {
    modelOutputText,
    citations,
    retrievalStatus,
    rawRetrievalStatus: rawStatus,
    retrievedUrl,
    tokenUsage: resp.usage,
  };
}

export function userMessageForHttpStatus(status: number): { code: import('@/types/urlSource').UrlExtractionErrorCode; message: string } {
  if (status === 401 || status === 403) {
    return {
      code: 'AUTH_ERROR',
      message: 'Could not authenticate with Google AI. Check your API key in Settings.',
    };
  }
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      message: 'This page could not be found. Check the URL or paste the text directly.',
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      message: 'The URL-reading limit has been reached temporarily. Try again later or paste the source text.',
    };
  }
  if (status >= 500) {
    return {
      code: 'NETWORK_ERROR',
      message: 'The source reader is temporarily unavailable. Try again or paste the text directly.',
    };
  }
  return {
    code: 'UNKNOWN',
    message: 'Could not read that URL. Try again or paste the text directly.',
  };
}

export function userMessageForRetrievalStatus(status: UrlRetrievalStatus): { code: import('@/types/urlSource').UrlExtractionErrorCode; message: string } | null {
  switch (status) {
    case 'unsafe':
      return {
        code: 'UNSAFE_URL',
        message: 'This source could not be processed by the content safety check.',
      };
    case 'unsupported':
      return {
        code: 'UNSUPPORTED_SOURCE',
        message: 'This type of link is not supported. Try a public webpage or direct PDF link.',
      };
    case 'unavailable':
      return {
        code: 'NOT_FOUND',
        message: 'This page could not be accessed. It may require login or no longer exist.',
      };
    default:
      return null;
  }
}

export function inferLoginOrPaywall(warnings: string[], rawStatus?: string): { code: import('@/types/urlSource').UrlExtractionErrorCode; message: string } | null {
  const blob = `${warnings.join(' ')} ${rawStatus ?? ''}`.toLowerCase();
  if (/paywall|subscription|subscribe|premium access/.test(blob)) {
    return {
      code: 'PAYWALL',
      message: 'This page cannot be read because it requires access or a subscription. Paste the relevant text instead.',
    };
  }
  if (/login|sign in|authentication|authorized|permission denied/.test(blob)) {
    return {
      code: 'LOGIN_REQUIRED',
      message: 'This page cannot be read because it requires access or a subscription. Paste the relevant text instead.',
    };
  }
  return null;
}
