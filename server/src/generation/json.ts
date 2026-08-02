import { ApiError } from '../api/apiError';

export function extractJsonObject(raw: string): Record<string, unknown> {
  const stripped = raw
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/```json/gi, '```')
    .trim();
  const fence = stripped.match(/```\s*([\s\S]*?)\s*```/);
  const text = fence?.[1]?.includes('{') ? fence[1].trim() : stripped.replace(/```/g, '').trim();
  const start = text.indexOf('{');
  if (start === -1) throw new ApiError(502, 'AI output did not contain JSON.', 'AI_INVALID_OUTPUT');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1).replace(/,(\s*[}\]])/g, '$1');
        try {
          return JSON.parse(candidate) as Record<string, unknown>;
        } catch {
          throw new ApiError(502, 'AI output was not valid JSON.', 'AI_INVALID_OUTPUT');
        }
      }
    }
  }
  throw new ApiError(502, 'AI output JSON was incomplete.', 'AI_INVALID_OUTPUT');
}

export function extractJsonValue(raw: string): unknown {
  const stripped = raw
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/```json/gi, '```')
    .trim();
  const fence = stripped.match(/```\s*([\s\S]*?)\s*```/);
  const text = fence?.[1] ?? stripped.replace(/```/g, '').trim();
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const start = firstArr >= 0 && (firstObj < 0 || firstArr < firstObj) ? firstArr : firstObj;
  if (start < 0) throw new ApiError(502, 'AI output did not contain JSON.', 'AI_INVALID_OUTPUT');

  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1).replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(candidate);
      }
    }
  }
  throw new ApiError(502, 'AI output JSON was incomplete.', 'AI_INVALID_OUTPUT');
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

export function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
