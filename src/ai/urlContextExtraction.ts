import {
  buildExtractionPrompt,
  URL_EXTRACTION_JSON_SCHEMA,
} from '@/ai/urlSourceSchema';
import {
  inferLoginOrPaywall,
  parseInteractionsResponse,
  userMessageForHttpStatus,
  userMessageForRetrievalStatus,
} from '@/ai/urlContextResponseParser';
import {
  mapRetrievalStatus,
  parseExtractionJsonText,
  validateExtractedPayload,
} from '@/ai/urlSourceValidation';
import {
  ExtractedUrlSource,
  ExtractUrlOptions,
  UrlExtractionError,
} from '@/types/urlSource';
import {
  getUrlExtraction,
  makeExtractionId,
  saveUrlExtraction,
} from '@/storage/urlSourceStorage';
import { validatePublicUrl } from '@/utils/urlValidation';

const GEMINI_INTERACTIONS_URL =
  'https://generativelanguage.googleapis.com/v1beta/interactions';
export const GEMINI_URL_CONTEXT_MODEL = 'gemini-3.1-flash-lite';
const REQUEST_TIMEOUT_MS = 55_000;
const RETRY_DELAY_MS = 1_500;

const DEBUG: boolean = (globalThis as { __DEV__?: boolean }).__DEV__ ?? true;

const inFlight = new Map<string, Promise<ExtractedUrlSource>>();

function log(msg: string, detail?: Record<string, unknown>) {
  if (!DEBUG) return;
  console.log(`[URL Context] ${msg}`, detail ?? '');
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function postInteraction(
  apiKey: string,
  normalizedUrl: string,
  signal: AbortSignal,
): Promise<unknown> {
  const body = {
    model: GEMINI_URL_CONTEXT_MODEL,
    input: buildExtractionPrompt(normalizedUrl),
    tools: [{ type: 'url_context' }],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: URL_EXTRACTION_JSON_SCHEMA,
    },
  };

  const res = await fetch(GEMINI_INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = userMessageForHttpStatus(res.status);
    log('HTTP error', { status: res.status, detail: detail.slice(0, 200) });
    throw new UrlExtractionError(err.code, err.message);
  }

  return res.json();
}

async function requestExtraction(
  apiKey: string,
  normalizedUrl: string,
): Promise<ExtractedUrlSource> {
  const started = Date.now();
  let retryCount = 0;

  const attempt = async (): Promise<ExtractedUrlSource> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const raw = await postInteraction(apiKey, normalizedUrl, controller.signal);
      const parsed = parseInteractionsResponse(raw);

      log('Interaction parsed', {
        durationMs: Date.now() - started,
        retryCount,
        retrievalStatus: parsed.retrievalStatus,
        retrievedUrl: parsed.retrievedUrl,
        citations: parsed.citations.length,
        tokens: parsed.tokenUsage,
      });

      const retrievalErr = userMessageForRetrievalStatus(parsed.retrievalStatus);
      if (retrievalErr) {
        throw new UrlExtractionError(retrievalErr.code, retrievalErr.message);
      }

      const payload = validateExtractedPayload(parseExtractionJsonText(parsed.modelOutputText));
      if (payload.errors.length > 0) {
        throw new UrlExtractionError(
          'MALFORMED_RESPONSE',
          'The source could not be structured reliably. Try again or paste the text directly.',
        );
      }

      const loginPaywall = inferLoginOrPaywall(
        payload.data.sourceWarnings,
        parsed.rawRetrievalStatus,
      );
      if (loginPaywall) {
        throw new UrlExtractionError(loginPaywall.code, loginPaywall.message);
      }

      const status = mapRetrievalStatus(parsed.rawRetrievalStatus);
      if (status === 'unsafe') {
        throw new UrlExtractionError(
          'UNSAFE_URL',
          'This source could not be processed by the content safety check.',
        );
      }

      const source: ExtractedUrlSource = {
        id: makeExtractionId(),
        originalUrl: normalizedUrl,
        retrievedUrl: parsed.retrievedUrl ?? normalizedUrl,
        citations: parsed.citations,
        retrievalStatus: status,
        rawRetrievalStatus: parsed.rawRetrievalStatus,
        model: GEMINI_URL_CONTEXT_MODEL,
        extractedAt: new Date().toISOString(),
        ...payload.data,
      };

      if (!source.summary.trim() || source.sections.length === 0) {
        throw new UrlExtractionError(
          'EMPTY_CONTENT',
          'No readable educational content was found at this URL. Paste the text directly instead.',
        );
      }

      return source;
    } catch (e) {
      if (e instanceof UrlExtractionError) throw e;
      if (controller.signal.aborted) {
        throw new UrlExtractionError(
          'TIMEOUT',
          'The source took too long to read. Try again or paste the text directly.',
        );
      }
      throw new UrlExtractionError(
        'NETWORK_ERROR',
        'Could not reach the source reader. Check your connection or paste the text directly.',
      );
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (first) {
    if (
      !(first instanceof UrlExtractionError) ||
      !['NETWORK_ERROR', 'RATE_LIMITED', 'TIMEOUT'].includes(first.code)
    ) {
      throw first;
    }
    retryCount = 1;
    log('Retrying extraction', { reason: first.code });
    await sleep(RETRY_DELAY_MS);
    try {
      return await attempt();
    } catch (second) {
      if (second instanceof UrlExtractionError) throw second;
      throw new UrlExtractionError(
        'NETWORK_ERROR',
        'Could not read that URL. Try again or paste the text directly.',
      );
    }
  }
}

export async function extractContentFromUrl(
  url: string,
  options: ExtractUrlOptions,
): Promise<ExtractedUrlSource> {
  const validation = validatePublicUrl(url);
  if (!validation.ok) {
    throw new UrlExtractionError(validation.code, validation.message);
  }

  if (!options.apiKey?.trim()) {
    throw new UrlExtractionError(
      'AUTH_ERROR',
      'Add your Google AI API key in Settings to read URLs.',
    );
  }

  const { normalized } = validation;

  if (!options.forceRefresh) {
    const cached = await getUrlExtraction(normalized);
    if (cached && cached.retrievalStatus !== 'unsafe') {
      log('Cache hit', { url: normalized });
      return cached;
    }
    log('Cache miss', { url: normalized });
  }

  const existing = inFlight.get(normalized);
  if (existing) return existing;

  const promise = (async () => {
    const source = await requestExtraction(options.apiKey, normalized);
    if (source.retrievalStatus !== 'unsafe') {
      await saveUrlExtraction({ ...source, originalUrl: normalized });
    }
    return source;
  })();

  inFlight.set(normalized, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(normalized);
  }
}
