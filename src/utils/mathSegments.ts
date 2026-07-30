export type MathSegment = { type: 'text' | 'math'; content: string; block: boolean };

const BLOCK_PATTERNS = [
  /\$\$([\s\S]+?)\$\$/g,
  /\\\[([\s\S]+?)\\\]/g,
];

const INLINE_PATTERN = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)|\\\(([^)]+?)\\\)/g;

/** Split a string into plain text and math segments (inline and block). */
export function splitMathSegments(input: string): MathSegment[] {
  if (!input) return [];

  const blockRanges: Array<{ start: number; end: number; content: string }> = [];
  for (const pattern of BLOCK_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(input)) !== null) {
      blockRanges.push({
        start: match.index,
        end: match.index + match[0].length,
        content: (match[1] ?? '').trim(),
      });
    }
  }

  blockRanges.sort((a, b) => a.start - b.start);
  const merged: typeof blockRanges = [];
  for (const range of blockRanges) {
    const last = merged[merged.length - 1];
    if (last && range.start < last.end) continue;
    merged.push(range);
  }

  const segments: MathSegment[] = [];
  let cursor = 0;

  const pushText = (text: string) => {
    if (text) segments.push({ type: 'text', content: text, block: false });
  };

  const pushInlineMath = (text: string) => {
    let remaining = text;
    INLINE_PATTERN.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INLINE_PATTERN.exec(remaining)) !== null) {
      pushText(remaining.slice(lastIndex, match.index));
      const math = (match[1] ?? match[2] ?? '').trim();
      if (math) segments.push({ type: 'math', content: math, block: false });
      lastIndex = match.index + match[0].length;
    }
    pushText(remaining.slice(lastIndex));
  };

  for (const range of merged) {
    if (cursor < range.start) {
      pushInlineMath(input.slice(cursor, range.start));
    }
    if (range.content) {
      segments.push({ type: 'math', content: range.content, block: true });
    }
    cursor = range.end;
  }

  if (cursor < input.length) {
    pushInlineMath(input.slice(cursor));
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: input, block: false }];
}

/** True when the string contains math delimiters. */
export function hasMathDelimiters(input: string): boolean {
  return /(\$\$[\s\S]+?\$\$|(?<!\$)\$(?!\$)[^$\n]+?\$(?!\$)|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/.test(
    input,
  );
}
