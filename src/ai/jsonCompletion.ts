import { stripReasoningWrappers } from '@/ai/sanitize';
import { AiConfig } from '@/types/content';
import { AiError } from '@/ai/client';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
  throw new AiError(`Request failed (${status}).${detail ? ` ${detail}` : ''}`);
}

/** Shared JSON completion helper for roadmap and other structured AI outputs. */
export async function requestJsonCompletion(
  config: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  if (!config.apiKey) throw new AiError('Add your API key in Settings first.');
  if (!config.baseUrl) throw new AiError('Set a provider base URL in Settings.');
  if (!config.model) throw new AiError('Choose a model in Settings.');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let res: Response;
  try {
    res = await postChat(config, messages, { json: true, maxTokens });
    if (res.status === 400) {
      res = await postChat(config, messages, { json: false, maxTokens });
    }
  } catch {
    throw new AiError('Network error. Check your connection and base URL.');
  }

  if (!res.ok) throwForStatus(res.status, await readError(res));

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
