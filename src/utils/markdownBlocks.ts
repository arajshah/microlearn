export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'code'; text: string }
  | { type: 'quote'; text: string };

function isBulletLine(line: string): boolean {
  return /^\s*[-*+]\s+/.test(line);
}

function isNumberedLine(line: string): boolean {
  return /^\s*\d+[.)]\s+/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^\s*[-*+]\s+/, '').trim();
}

function stripNumbered(line: string): string {
  return line.replace(/^\s*\d+[.)]\s+/, '').trim();
}

/** Parse markdown-ish text into blocks (no raw HTML). */
export function parseMarkdownBlocks(input: string): MarkdownBlock[] {
  if (!input?.trim()) return [];

  const normalized = input.replace(/\r\n/g, '\n').trim();
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  const lines = normalized.split('\n');

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', text: codeLines.join('\n') });
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      i++;
      continue;
    }

    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n') });
      continue;
    }

    if (isBulletLine(line)) {
      const items: string[] = [];
      while (i < lines.length && isBulletLine(lines[i])) {
        items.push(stripBullet(lines[i]));
        i++;
      }
      blocks.push({ type: 'bullet', items });
      continue;
    }

    if (isNumberedLine(line)) {
      const items: string[] = [];
      while (i < lines.length && isNumberedLine(lines[i])) {
        items.push(stripNumbered(lines[i]));
        i++;
      }
      blocks.push({ type: 'numbered', items });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !isBulletLine(lines[i]) &&
      !isNumberedLine(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
  }

  return blocks.length > 0 ? blocks : [{ type: 'paragraph', text: normalized }];
}

export type InlineStyle = 'bold' | 'italic' | 'code';

export type InlineSegment = { text: string; styles: InlineStyle[] };

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|__[^_]+__|_[^_\n]+_|`[^`]+`)/g;

/** Parse inline markdown styles within a line. */
export function parseInlineSegments(line: string): InlineSegment[] {
  if (!line) return [{ text: '', styles: [] }];

  const segments: InlineSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;

  while ((match = INLINE_RE.exec(line)) !== null) {
    if (match.index > last) {
      segments.push({ text: line.slice(last, match.index), styles: [] });
    }
    const token = match[0];
    if (token.startsWith('**') || token.startsWith('__')) {
      segments.push({ text: token.slice(2, -2), styles: ['bold'] });
    } else if (token.startsWith('*') || token.startsWith('_')) {
      segments.push({ text: token.slice(1, -1), styles: ['italic'] });
    } else if (token.startsWith('`')) {
      segments.push({ text: token.slice(1, -1), styles: ['code'] });
    }
    last = match.index + token.length;
  }

  if (last < line.length) {
    segments.push({ text: line.slice(last), styles: [] });
  }

  return segments.length > 0 ? segments : [{ text: line, styles: [] }];
}
