import { randomUUID } from 'node:crypto';
import type { CreateRoadmapInput } from '../curriculum/curriculumRepository';
import type { SourceDocumentRow, SourceSummary } from './sourceTypes';
import { parseSummary } from './sourceSerialization';

type Depth = 'quick' | 'standard' | 'deep';

const DEPTH_LESSON_COUNTS: Record<Depth, [number, number]> = {
  quick: [6, 8],
  standard: [12, 16],
  deep: [20, 28],
};

function splitSections(text: string, summary?: SourceSummary): string[] {
  if (summary?.detectedSections && summary.detectedSections.length >= 2) {
    return summary.detectedSections;
  }
  const chunks = text
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 80);
  if (chunks.length >= 2) return chunks.slice(0, 12).map((c) => c.slice(0, 160));
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 40);
  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += 4) {
    groups.push(sentences.slice(i, i + 4).join(' ').slice(0, 200));
  }
  return groups.length > 0 ? groups.slice(0, 12) : [text.slice(0, 500)];
}

function lessonTitle(section: string, index: number): string {
  const firstLine = section.split('\n')[0]?.trim() ?? section;
  const cleaned = firstLine.replace(/^#+\s*/, '').replace(/^\d+(\.\d+)*\s*/, '').trim();
  if (cleaned.length >= 8 && cleaned.length <= 90) return cleaned;
  return `Lesson ${index + 1}`;
}

function keyIdeas(section: string): string[] {
  const sentences = section.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
  return sentences.slice(0, 3).map((s) => s.slice(0, 120));
}

export function buildDraftRoadmapFromSource(
  source: SourceDocumentRow,
  input: {
    title?: string;
    goal: string;
    masteryLevel: number;
    depth: Depth;
  },
): CreateRoadmapInput {
  const summary = parseSummary(source.summary_json);
  const text = source.extracted_text ?? '';
  const sections = splitSections(text, summary);
  const [minLessons, maxLessons] = DEPTH_LESSON_COUNTS[input.depth];
  const targetLessons = Math.min(maxLessons, Math.max(minLessons, Math.ceil(sections.length * 1.2)));
  const unitCount = input.depth === 'quick' ? 2 : input.depth === 'deep' ? 4 : 3;
  const lessonsPerUnit = Math.max(2, Math.ceil(targetLessons / unitCount));

  const units = Array.from({ length: unitCount }, (_, unitIdx) => {
    const unitSections = sections.slice(unitIdx * lessonsPerUnit, (unitIdx + 1) * lessonsPerUnit);
    const lessons = unitSections.map((section, lessonIdx) => {
      const globalIdx = unitIdx * lessonsPerUnit + lessonIdx;
      const prevId = globalIdx > 0 ? `lesson-${globalIdx - 1}` : undefined;
      return {
        id: `lesson-${globalIdx}`,
        title: lessonTitle(section, globalIdx),
        shortDescription: section.slice(0, 180),
        learningObjective: `Understand ${lessonTitle(section, globalIdx).toLowerCase()} from the source document.`,
        estimatedMinutes: input.depth === 'deep' ? 12 : input.depth === 'quick' ? 6 : 8,
        difficulty: Math.min(5, Math.max(1, input.masteryLevel)),
        order: lessonIdx,
        prerequisiteIds: prevId ? [prevId] : [],
        keyIdeas: keyIdeas(section),
      };
    });
    return {
      id: `unit-${unitIdx + 1}`,
      title: `Unit ${unitIdx + 1}`,
      description: `Lessons derived from ${source.title ?? 'source document'} (part ${unitIdx + 1}).`,
      order: unitIdx,
      lessons,
    };
  }).filter((u) => u.lessons.length > 0);

  const title = input.title ?? source.title ?? 'Roadmap from document';
  return {
    title,
    topic: title,
    goal: input.goal,
    description: `Draft roadmap generated from source document ${source.id}. Review and refine before publishing.`,
    masteryLevel: input.masteryLevel,
    depth: input.depth,
    units,
    changeSummary: `Created draft roadmap from source document ${source.id}`,
  };
}

export function buildDraftLessonFromSource(
  source: SourceDocumentRow,
  input: {
    title?: string;
    goal?: string;
    masteryLevel: number;
    depth: Depth;
  },
): Record<string, unknown> {
  const text = source.extracted_text ?? '';
  const summary = parseSummary(source.summary_json);
  const title = input.title ?? source.title ?? 'Lesson from document';
  const goal = input.goal ?? `Learn the key ideas from ${title}`;
  const cardCount = input.depth === 'deep' ? 8 : input.depth === 'quick' ? 4 : 6;
  const chunkSize = Math.max(1, Math.ceil(text.length / cardCount));
  const cards = Array.from({ length: cardCount }, (_, i) => {
    const chunk = text.slice(i * chunkSize, (i + 1) * chunkSize).trim();
    const preview = chunk.slice(0, 280);
    return {
      id: randomUUID(),
      type: 'concept',
      front: i === 0 ? `What is covered in ${title}?` : `Key idea ${i + 1}`,
      back: preview || summary?.preview || goal,
    };
  });

  return {
    id: randomUUID(),
    title,
    objective: goal,
    learningObjective: goal,
    minutes: input.depth === 'deep' ? 15 : input.depth === 'quick' ? 6 : 10,
    masteryLevel: input.masteryLevel,
    cards,
    sourceDocumentId: source.id,
    sourceUrl: source.url,
    sourceTitle: source.title,
    sourceSummary: summary,
  };
}

export function buildSingleLessonRoadmapInput(
  source: SourceDocumentRow,
  lessonNodeId: string,
  input: {
    title?: string;
    goal?: string;
    masteryLevel: number;
    depth: Depth;
  },
): CreateRoadmapInput {
  const title = input.title ?? source.title ?? 'Single lesson from document';
  const goal = input.goal ?? `Understand the core ideas in ${title}`;
  return {
    title,
    topic: title,
    goal,
    description: `Single-lesson container for source document ${source.id}.`,
    masteryLevel: input.masteryLevel,
    depth: 'quick',
    units: [
      {
        id: 'unit-1',
        title: 'Source lesson',
        description: 'Generated from extracted document text.',
        order: 0,
        lessons: [
          {
            id: lessonNodeId,
            title,
            shortDescription: (parseSummary(source.summary_json)?.preview ?? '').slice(0, 180),
            learningObjective: goal,
            estimatedMinutes: input.depth === 'deep' ? 15 : input.depth === 'quick' ? 6 : 10,
            difficulty: input.masteryLevel,
            order: 0,
            prerequisiteIds: [],
            keyIdeas: (parseSummary(source.summary_json)?.detectedSections ?? []).slice(0, 3),
          },
        ],
      },
    ],
    changeSummary: `Created single-lesson roadmap from source ${source.id}`,
  };
}
