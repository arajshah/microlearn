/**
 * Deterministic, safe formatter for tutor replies.
 * Does not execute HTML/markup; only structures plain text for rendering.
 */

export type TutorReplyBlock =
  | { type: 'paragraph'; key: string; text: string }
  | { type: 'bullet'; key: string; text: string }
  | { type: 'numbered'; key: string; index: number; text: string }
  | { type: 'code'; key: string; language: string; text: string };

const BULLET_RE = /^(?:[-*•]|\u2022)\s+(.*)$/;
const NUMBERED_RE = /^(\d+)[.)]\s+(.*)$/;
const FENCE_OPEN_RE = /^```([\w+-]*)\s*$/;

function isFenceLine(line: string): boolean {
  return line.trim().startsWith('```');
}

function isSoftWrapContinuation(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  if (isFenceLine(prev) || isFenceLine(next)) return false;
  if (BULLET_RE.test(next) || NUMBERED_RE.test(next) || FENCE_OPEN_RE.test(next)) return false;
  if (BULLET_RE.test(prev) || NUMBERED_RE.test(prev)) return false;
  if (prev.endsWith('-') && !prev.endsWith('--')) return true;
  // Soft wrap: previous line does not end a sentence / block and next is lowercase-ish prose.
  const endsHard = /[.!?:;)]$/.test(prev) || prev.endsWith('"""') || prev.endsWith("'''");
  if (endsHard) return false;
  const startsLower = /^[a-z]/.test(next);
  const startsMid = /^(and|or|but|so|to|of|in|on|for|with|that|which|who|as|if|then)\b/i.test(next);
  return startsLower || startsMid;
}

function joinSoftWrapped(lines: string[]): string[] {
  const out: string[] = [];
  let inCode = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, '');
    const trimmed = line.trim();
    if (isFenceLine(trimmed)) {
      inCode = !inCode;
      out.push(line);
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    if (out.length === 0) {
      out.push(line);
      continue;
    }
    const prev = out[out.length - 1]!;
    if (line.trim() === '') {
      out.push('');
      continue;
    }
    if (prev.trim() === '') {
      out.push(line);
      continue;
    }
    if (isSoftWrapContinuation(prev.trimEnd(), line.trimStart())) {
      const joiner = prev.endsWith('-') ? '' : ' ';
      const left = prev.endsWith('-') ? prev.slice(0, -1) : prev;
      out[out.length - 1] = `${left}${joiner}${line.trimStart()}`;
      continue;
    }
    out.push(line);
  }
  return out;
}

function makeKey(type: string, index: number, sample: string): string {
  const slug = sample.slice(0, 24).replace(/\s+/g, '_');
  return `${type}-${index}-${slug.length}-${slug}`;
}

/** Parse tutor reply text into renderable blocks. */
export function formatTutorReply(raw: string): TutorReplyBlock[] {
  const text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const lines = joinSoftWrapped(text.split('\n'));
  const blocks: TutorReplyBlock[] = [];
  let i = 0;
  let blockIndex = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const fence = trimmed.match(FENCE_OPEN_RE);
    if (fence) {
      const language = fence[1] ?? '';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length) {
        const inner = lines[i] ?? '';
        if (inner.trim().startsWith('```')) {
          i += 1;
          break;
        }
        codeLines.push(inner);
        i += 1;
      }
      const code = codeLines.join('\n');
      blocks.push({
        type: 'code',
        key: makeKey('code', blockIndex++, code),
        language,
        text: code,
      });
      continue;
    }

    const bullet = trimmed.match(BULLET_RE);
    if (bullet) {
      blocks.push({
        type: 'bullet',
        key: makeKey('bullet', blockIndex++, bullet[1] ?? ''),
        text: (bullet[1] ?? '').trim(),
      });
      i += 1;
      continue;
    }

    const numbered = trimmed.match(NUMBERED_RE);
    if (numbered) {
      blocks.push({
        type: 'numbered',
        key: makeKey('num', blockIndex++, numbered[2] ?? ''),
        index: Number.parseInt(numbered[1] ?? '1', 10) || 1,
        text: (numbered[2] ?? '').trim(),
      });
      i += 1;
      continue;
    }

    // Accumulate a paragraph until a blank line or a special line.
    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = (lines[i] ?? '').trim();
      if (!next) break;
      if (FENCE_OPEN_RE.test(next) || BULLET_RE.test(next) || NUMBERED_RE.test(next)) break;
      para.push(next);
      i += 1;
    }
    const paragraph = para.join(' ').replace(/\s{2,}/g, ' ').trim();
    if (paragraph) {
      blocks.push({
        type: 'paragraph',
        key: makeKey('p', blockIndex++, paragraph),
        text: paragraph,
      });
    }
  }

  return blocks;
}
