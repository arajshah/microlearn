import { stripReasoningWrappers } from '@/ai/sanitize';
import { AiError } from '@/ai/client';

/** Extract the first balanced JSON object from a model response. */
export function extractJsonObject(raw: string): string {
  const stripped = stripReasoningWrappers(raw.trim());
  let s = stripped;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1].includes('{')) s = fence[1].trim();
  else s = s.replace(/```json/gi, '').replace(/```/g, '').trim();

  const anchored = s.match(/\{\s*"/);
  const start = anchored?.index ?? s.indexOf('{');
  if (start === -1) throw new AiError('The model did not return JSON.');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new AiError('The JSON response was truncated.');
}

export function repairJson(s: string): string {
  return s
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  const candidate = extractJsonObject(raw);
  try {
    const obj = JSON.parse(candidate);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return obj as Record<string, unknown>;
    }
  } catch {
    const repaired = repairJson(candidate);
    const obj = JSON.parse(repaired);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return obj as Record<string, unknown>;
    }
  }
  throw new AiError('Invalid JSON structure.');
}

export function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function asNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x)).filter(Boolean);
}
