import { SourceExtractionError } from './sourceTypes';

export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function extractTextFromTxt(buffer: Buffer): string {
  return normalizeExtractedText(buffer.toString('utf8'));
}

export function extractTextFromMarkdown(buffer: Buffer): string {
  return normalizeExtractedText(buffer.toString('utf8'));
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return normalizeExtractedText(result.text ?? '');
  } catch {
    throw new SourceExtractionError('EXTRACTION_FAILED', 'Could not extract text from PDF.');
  }
}
