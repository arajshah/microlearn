import {
  ExtractedUrlSource,
  RoadmapSourceContext,
} from '@/types/urlSource';
import { UrlSourceSection } from '@/types/urlSource';

export function toRoadmapSourceContext(source: ExtractedUrlSource): RoadmapSourceContext {
  return {
    sourceUrl: source.originalUrl,
    sourceTitle: source.title,
    sourceSummary: source.summary,
    sourceSections: source.sections,
    keyConcepts: source.keyConcepts,
    importantTerms: source.importantTerms,
    sourceWarnings: source.sourceWarnings,
  };
}

/** Compact text block for legacy sourceText lesson prompts. */
export function formatSourceAsText(source: RoadmapSourceContext, focus?: string): string {
  const sections = source.sourceSections
    .map(
      (s) =>
        `## ${s.heading}\n${s.summary}\n${s.keyPoints.map((p) => `- ${p}`).join('\n')}`,
    )
    .join('\n\n');

  return [
    `Source: ${source.sourceTitle}`,
    `URL: ${source.sourceUrl}`,
    source.sourceSummary,
    '',
    'Key concepts: ' + source.keyConcepts.join('; '),
    source.importantTerms.length ? 'Terms: ' + source.importantTerms.join('; ') : '',
    focus?.trim() ? `Focus: ${focus.trim()}` : '',
    '',
    sections,
  ]
    .filter(Boolean)
    .join('\n');
}

function overlapScore(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((score, term) => (lower.includes(term.toLowerCase()) ? score + 1 : score), 0);
}

/** Pick sections most relevant to a roadmap lesson node. */
export function relevantSectionsForLesson(
  source: RoadmapSourceContext,
  lessonTitle: string,
  keyIdeas: string[],
  unitTitle: string,
  maxSections = 3,
): UrlSourceSection[] {
  const terms = [...keyIdeas, lessonTitle, unitTitle];
  const ranked = [...source.sourceSections].sort(
    (a, b) =>
      overlapScore(`${b.heading} ${b.summary}`, terms) -
      overlapScore(`${a.heading} ${a.summary}`, terms),
  );
  return ranked.slice(0, maxSections);
}

export function formatRelevantSourceExcerpt(
  source: RoadmapSourceContext,
  lessonTitle: string,
  keyIdeas: string[],
  unitTitle: string,
): string {
  const sections = relevantSectionsForLesson(source, lessonTitle, keyIdeas, unitTitle);
  if (sections.length === 0) {
    return `Source summary: ${source.sourceSummary.slice(0, 1200)}`;
  }
  return sections
    .map(
      (s) =>
        `[${s.heading}] ${s.summary}. Key points: ${s.keyPoints.slice(0, 4).join('; ')}`,
    )
    .join('\n');
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
