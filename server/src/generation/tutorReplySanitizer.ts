/**
 * Defensive cleanup for tutor model output.
 * Removes hidden reasoning and normalizes prose while preserving code,
 * formulas, URLs, decimals, and legitimate uses of words like "analysis".
 */

export const TUTOR_EMPTY_FALLBACK =
  'I could not produce a clear answer just now. Please ask again in a different way.';

const REASONING_TAGS = [
  'think',
  'thought',
  'thinking',
  'reasoning',
  'analysis',
  'scratchpad',
  'reflection',
] as const;

const META_LABEL_RE =
  /^(?:analysis|thought\s*process|thinking|reasoning|let\s+me\s+reason|we\s+need\s+(?:an?\s+)?answer|final\s+answer|scratch\s*work|internal\s+(?:notes?|reasoning)|chain\s+of\s+thought)\s*:\s*/i;

const FINAL_ANSWER_SPLIT_RE =
  /(?:^|\n)\s*(?:final\s+answer)\s*:\s*/i;

/** Protect fenced code while transforming the surrounding prose. */
function mapOutsideCode(input: string, map: (segment: string) => string): string {
  const parts = input.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => (part.startsWith('```') ? part : map(part)))
    .join('');
}

function stripReasoningTags(input: string): string {
  let out = input;

  for (const tag of REASONING_TAGS) {
    const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    out = out.replace(paired, '');
  }

  // If a closed reasoning tag appears, prefer content after the last closing tag
  // when the prefix looks like hidden deliberation.
  for (const tag of REASONING_TAGS) {
    const close = new RegExp(`</${tag}>`, 'gi');
    let lastEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = close.exec(out)) !== null) {
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd !== -1) {
      const before = out.slice(0, lastEnd);
      const after = out.slice(lastEnd).trim();
      if (after && /<(?:think|thought|thinking|reasoning|analysis)\b/i.test(before)) {
        out = after;
        break;
      }
      if (after && META_LABEL_RE.test(before.trim().split('\n')[0] ?? '')) {
        out = after;
        break;
      }
    }
  }

  // Unclosed leading reasoning block with no recoverable answer.
  out = out.replace(
    new RegExp(
      `^\\s*<(?:${REASONING_TAGS.join('|')})\\b[^>]*>[\\s\\S]*$`,
      'i',
    ),
    '',
  );

  return out;
}

function extractFinalAnswerIfPresent(input: string): string {
  const match = FINAL_ANSWER_SPLIT_RE.exec(input);
  if (!match || match.index == null) return input;

  const before = input.slice(0, match.index).trim();
  const after = input.slice(match.index + match[0].length).trim();
  if (!after) return input;

  // Prefer final-answer section when the lead-in looks like reasoning/meta.
  const looksLikeReasoning =
    META_LABEL_RE.test(before.split('\n')[0] ?? '') ||
    /(?:analysis|reasoning|thought process|thinking|scratch)/i.test(before.slice(0, 200));

  return looksLikeReasoning ? after : input;
}

function stripLeadingMetaLabels(input: string): string {
  const lines = input.split('\n');
  while (lines.length > 0) {
    const first = (lines[0] ?? '').trim();
    if (!first) {
      lines.shift();
      continue;
    }
    if (META_LABEL_RE.test(first)) {
      const rest = first.replace(META_LABEL_RE, '').trim();
      if (rest) lines[0] = rest;
      else lines.shift();
      // Only strip a run of leading meta labels / blank lines.
      continue;
    }
    break;
  }
  return lines.join('\n');
}

function normalizeParagraphKey(p: string): string {
  return p
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeAdjacentDuplicateParagraphs(input: string): string {
  const paragraphs = input.split(/\n{2,}/);
  const out: string[] = [];
  let prevKey = '';
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    const key = normalizeParagraphKey(trimmed);
    if (key && key === prevKey) continue;
    out.push(trimmed);
    prevKey = key;
  }
  return out.join('\n\n');
}

function removeAdjacentDuplicateSentences(input: string): string {
  return mapOutsideCode(input, (segment) => {
    // Split on sentence boundaries while keeping delimiters.
    const parts = segment.split(/(?<=[.!?])\s+/);
    const out: string[] = [];
    let prev = '';
    for (const part of parts) {
      const key = normalizeParagraphKey(part);
      const prevKey = normalizeParagraphKey(prev);
      if (key && prevKey && key === prevKey) continue;
      out.push(part);
      prev = part;
    }
    return out.join(' ').replace(/[ \t]{2,}/g, ' ');
  });
}

function normalizePunctuationAndDashes(input: string): string {
  return mapOutsideCode(input, (segment) => {
    let s = segment;
    // Decorative dash variants in ordinary prose → hyphen/comma-friendly hyphen.
    s = s.replace(/[\u2014\u2013\u2212]/g, '-');
    // Collapse repeated punctuation (keep a single mark). Avoid touching decimals/URLs/code.
    s = s.replace(/!{2,}/g, '!');
    s = s.replace(/\?{2,}/g, '?');
    s = s.replace(/\.{4,}/g, '...');
    // Repeated spaces (not newlines).
    s = s.replace(/[^\S\n]{2,}/g, ' ');
    // Excessive blank lines.
    s = s.replace(/\n{3,}/g, '\n\n');
    return s;
  });
}

export type TutorSanitizeResult =
  | { ok: true; text: string }
  | { ok: false; text: string; reason: 'empty' | 'reasoning_only' };

/**
 * Sanitize provider tutor output. Never returns a blank learner-facing string:
 * on failure, `ok` is false and `text` is a safe fallback.
 */
export function sanitizeTutorReply(raw: string | null | undefined): TutorSanitizeResult {
  if (raw == null || !String(raw).trim()) {
    return { ok: false, text: TUTOR_EMPTY_FALLBACK, reason: 'empty' };
  }

  let text = String(raw).replace(/\r\n/g, '\n').trim();
  const before = text;

  text = stripReasoningTags(text);
  text = extractFinalAnswerIfPresent(text);
  text = stripLeadingMetaLabels(text.trim());
  text = removeAdjacentDuplicateParagraphs(text);
  text = removeAdjacentDuplicateSentences(text);
  text = normalizePunctuationAndDashes(text);
  text = text.trim();

  if (!text) {
    const reason =
      before.trim().length > 0 && stripReasoningTags(before).trim().length === 0
        ? 'reasoning_only'
        : 'empty';
    return { ok: false, text: TUTOR_EMPTY_FALLBACK, reason };
  }

  return { ok: true, text };
}
