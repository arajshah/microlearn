import { MAX_EXTRACTED_TEXT_CHARS, MAX_TITLE_CHARS, type SourceSummary } from './sourceTypes';

export function truncateText(text: string, max = MAX_EXTRACTED_TEXT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function truncateTitle(title: string): string {
  const cleaned = title.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= MAX_TITLE_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_TITLE_CHARS - 1)}…`;
}

export function buildTextSummary(text: string): SourceSummary {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const preview = normalized.slice(0, 480).replace(/\s+/g, ' ').trim();
  const sections = detectSections(normalized);
  return {
    charCount: normalized.length,
    wordCount: words.length,
    preview: preview.length < normalized.length ? `${preview}…` : preview,
    detectedSections: sections.length > 0 ? sections.slice(0, 12) : undefined,
  };
}

function detectSections(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const headings: string[] = [];
  for (const line of lines) {
    if (/^#{1,3}\s+\S/.test(line)) {
      headings.push(line.replace(/^#+\s*/, '').slice(0, 120));
      continue;
    }
    if (/^[A-Z0-9][A-Z0-9\s\-:]{2,80}$/.test(line) && line.length < 90) {
      headings.push(line.slice(0, 120));
      continue;
    }
    if (/^\d+(\.\d+)*\s+[A-Z]/.test(line) && line.length < 100) {
      headings.push(line.slice(0, 120));
    }
  }
  return [...new Set(headings)];
}

export function inferTitleFromText(text: string, fallbackUrl: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 20)) {
    if (line.startsWith('# ')) return truncateTitle(line.slice(2));
    if (/^title:\s*/i.test(line)) return truncateTitle(line.replace(/^title:\s*/i, ''));
    if (line.length >= 8 && line.length <= 120 && /^[A-Z]/.test(line)) {
      return truncateTitle(line);
    }
  }
  try {
    const host = new URL(fallbackUrl).hostname.replace(/^www\./, '');
    return truncateTitle(`Document from ${host}`);
  } catch {
    return truncateTitle('Extracted document');
  }
}
