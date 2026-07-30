import { stripReasoningWrappers } from '@/ai/sanitize';
import { AiConfig } from '@/types/content';
import { AiError } from '@/ai/client';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

export interface JsonCompletionOptions {
  jsonMode?: boolean;
  retryWithoutJsonMode?: boolean;
  generationMode?: string;
  chunkIndex?: number;
  maxAttempts?: number;
}

async function postChat(
  config: AiConfig,
  messages: ChatMessage[],
  opts: { json: boolean; maxTokens: number },
): Promise<Response> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0.7,
    max_tokens: opts.maxTokens,
    messages,
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message || body?.message || '';
  } catch {
    return '';
  }
}

function throwForStatus(status: number, detail: string): never {
  if (status === 401 || status === 403) {
    throw new AiError('Invalid or unauthorized API key. Check it in Settings.');
  }
  if (status === 404) {
    throw new AiError(`Model or endpoint not found (404).${detail ? ` — ${detail}` : ''}`);
  }
  if (status === 429) {
    throw new AiError('Rate limited (429). Wait and try again.');
  }
  if (RETRYABLE_STATUSES.has(status)) {
    throw new AiError(`AI provider error (${status}).${detail ? ` ${detail}` : ''}`);
  }
  throw new AiError(`Request failed (${status}).${detail ? ` ${detail}` : ''}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableProviderStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

export function calculateRetryBackoffMs(attempt: number, jitter = Math.random()): number {
  const safeAttempt = Math.max(1, attempt);
  const base = 1000 * 2 ** (safeAttempt - 1);
  const jitterMs = Math.floor(Math.max(0, Math.min(1, jitter)) * 350);
  return base + jitterMs;
}

export function isGemmaGoogleProvider(config: AiConfig): boolean {
  return (
    config.baseUrl.toLowerCase().includes('generativelanguage.googleapis.com') &&
    config.model.toLowerCase().includes('gemma')
  );
}

function logProviderFailure(args: {
  config: AiConfig;
  status: number;
  jsonMode: boolean;
  maxTokens: number;
  generationMode?: string;
  chunkIndex?: number;
  detail?: string;
}): void {
  console.warn('[AI] provider failed', {
    model: args.config.model,
    status: args.status,
    jsonMode: args.jsonMode,
    maxTokens: args.maxTokens,
    generationMode: args.generationMode,
    chunkIndex: args.chunkIndex,
    detail: args.detail?.slice(0, 180),
  });
}

/** Shared JSON completion helper for roadmap and other structured AI outputs. */
export async function requestJsonCompletion(
  config: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  options: JsonCompletionOptions = {},
): Promise<string> {
  if (!config.apiKey) throw new AiError('Add your API key in Settings first.');
  if (!config.baseUrl) throw new AiError('Set a provider base URL in Settings.');
  if (!config.model) throw new AiError('Choose a model in Settings.');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let lastStatus = 0;
  let lastDetail = '';

  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  let useJsonMode = options.jsonMode ?? true;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await postChat(config, messages, { json: useJsonMode, maxTokens });
      if (res.status === 400) {
        res = await postChat(config, messages, { json: false, maxTokens });
        useJsonMode = false;
      }
    } catch {
      if (attempt < maxAttempts) {
        await sleep(400 * attempt);
        continue;
      }
      throw new AiError('Network error. Check your connection and base URL.');
    }

    if (!res.ok) {
      lastStatus = res.status;
      lastDetail = await readError(res);
      logProviderFailure({
        config,
        status: res.status,
        jsonMode: useJsonMode,
        maxTokens,
        generationMode: options.generationMode,
        chunkIndex: options.chunkIndex,
        detail: lastDetail,
      });
      if (
        isRetryableProviderStatus(res.status) &&
        options.retryWithoutJsonMode &&
        useJsonMode
      ) {
        useJsonMode = false;
      }
      if (isRetryableProviderStatus(res.status) && attempt < maxAttempts) {
        console.warn('[ai] retrying after provider error', res.status, attempt);
        await sleep(calculateRetryBackoffMs(attempt));
        continue;
      }
      throwForStatus(res.status, lastDetail);
    }

    let data: { choices?: Array<{ message?: { content?: string }; text?: string }> };
    try {
      data = await res.json();
    } catch {
      throw new AiError('The provider returned an unreadable response.');
    }

    const choice = data?.choices?.[0];
    const content = stripReasoningWrappers(
      (choice?.message?.content ?? choice?.text ?? '').trim(),
    );
    if (!content) throw new AiError('The model returned an empty response. Try again.');
    return content;
  }

  throw new AiError(
    `The AI provider failed (${lastStatus || 'unknown'}).${lastDetail ? ` ${lastDetail}` : ''} Try again.`,
  );
}
