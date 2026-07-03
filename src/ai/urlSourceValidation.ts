import { asString, asStringArray, parseJsonObject } from '@/ai/jsonExtract';
import {
  ExtractedUrlSource,
  UrlRetrievalStatus,
  UrlSourceSection,
} from '@/types/urlSource';

const MAX_SUMMARY_WORDS = 450;
const MAX_SECTIONS = 20;
const MAX_KEY_POINTS = 8;
const MAX_KEY_CONCEPTS = 30;
const MAX_TERMS = 40;
const MAX_WARNINGS = 10;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function parseSections(input: unknown): UrlSourceSection[] {
  if (!Array.isArray(input)) return [];
  const out: UrlSourceSection[] = [];
  for (const item of input.slice(0, MAX_SECTIONS)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const heading = asString(r.heading);
    const summary = asString(r.summary);
    const keyPoints = asStringArray(r.keyPoints).slice(0, MAX_KEY_POINTS);
    if (!heading || !summary) continue;
    out.push({ heading, summary, keyPoints });
  }
  return out;
}

export function validateExtractedPayload(
  obj: Record<string, unknown>,
): { data: Omit<ExtractedUrlSource, 'id' | 'originalUrl' | 'retrievedUrl' | 'citations' | 'model' | 'extractedAt' | 'retrievalStatus' | 'rawRetrievalStatus'>; errors: string[] } {
  const errors: string[] = [];
  const title = asString(obj.title);
  const summary = asString(obj.summary);
  const suggestedTopic = asString(obj.suggestedTopic);
  const suggestedLearningGoal = asString(obj.suggestedLearningGoal);

  if (!title) errors.push('Missing title');
  if (!summary) errors.push('Missing summary');
  if (wordCount(summary) > MAX_SUMMARY_WORDS) {
    errors.push(`Summary too long (${wordCount(summary)} words)`);
  }
  if (!suggestedTopic) errors.push('Missing suggestedTopic');
  if (!suggestedLearningGoal) errors.push('Missing suggestedLearningGoal');

  const sections = parseSections(obj.sections);
  if (sections.length === 0) errors.push('sections must not be empty');

  const keyConcepts = asStringArray(obj.keyConcepts).slice(0, MAX_KEY_CONCEPTS);
  const importantTerms = asStringArray(obj.importantTerms).slice(0, MAX_TERMS);
  const sourceWarnings = asStringArray(obj.sourceWarnings).slice(0, MAX_WARNINGS);

  if (keyConcepts.length === 0) errors.push('keyConcepts must not be empty');

  return {
    data: {
      title,
      contentType: asString(obj.contentType) || undefined,
      summary,
      sections,
      keyConcepts,
      importantTerms,
      suggestedTopic,
      suggestedLearningGoal,
      sourceWarnings,
    },
    errors,
  };
}

export function mapRetrievalStatus(raw?: string): UrlRetrievalStatus {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase();
  if (s.includes('unsafe')) return 'unsafe';
  if (s.includes('unsupported')) return 'unsupported';
  if (s.includes('unavailable') || s.includes('not_found') || s.includes('404')) {
    return 'unavailable';
  }
  if (s.includes('partial')) return 'partial';
  if (s.includes('success') || s.includes('complete')) return 'success';
  return 'unknown';
}

export function parseExtractionJsonText(text: string): Record<string, unknown> {
  return parseJsonObject(text);
}
