import { randomUUID } from 'node:crypto';
import type { Db } from '../db';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is', 'are',
  'this', 'that', 'it', 'its', 'be', 'as', 'by', 'from', 'at', 'how', 'what', 'why',
  'when', 'which', 'you', 'your', 'we', 'intro', 'introduction', 'basics', 'overview',
]);

/**
 * Canonical concept identifier: lowercase, hyphenated, punctuation stripped.
 * Must stay in sync with the client implementation in src/utils/conceptTags.ts.
 */
export function normalizeConceptSlug(name: string): string {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Human-readable label derived from a slug, used when no explicit name is given. */
export function conceptNameFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface UpsertConceptInput {
  slug?: string;
  name: string;
  description?: string;
  subjectId?: string;
  topic?: string;
  aliases?: string[];
  prerequisiteSlugs?: string[];
}

export interface ConceptRecord {
  id: string;
  slug: string;
  name: string;
  description?: string;
  subjectId?: string;
  topic?: string;
  aliases: string[];
  prerequisiteSlugs: string[];
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Creates or updates a concept row keyed by slug. Non-destructive on existing fields. */
export function upsertConcept(db: Db, input: UpsertConceptInput): ConceptRecord {
  const slug = normalizeConceptSlug(input.slug ?? input.name);
  if (!slug) throw new Error('Concept slug could not be derived from the provided name.');

  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM concepts WHERE slug = ?').get(slug) as
    | Record<string, string | null>
    | undefined;

  const name = input.name?.trim() || existing?.name || conceptNameFromSlug(slug);
  const aliases = [...new Set([...parseJsonArray(existing?.aliases_json ?? null), ...(input.aliases ?? [])])];
  const prerequisiteSlugs = [
    ...new Set([
      ...parseJsonArray(existing?.prerequisite_slugs_json ?? null),
      ...(input.prerequisiteSlugs ?? []).map(normalizeConceptSlug).filter(Boolean),
    ]),
  ];

  if (existing) {
    db.prepare(
      `UPDATE concepts SET
         name = @name,
         description = COALESCE(@description, description),
         subject_id = COALESCE(@subjectId, subject_id),
         topic = COALESCE(@topic, topic),
         aliases_json = @aliasesJson,
         prerequisite_slugs_json = @prerequisiteJson,
         updated_at = @now
       WHERE slug = @slug`,
    ).run({
      slug,
      name,
      description: input.description ?? null,
      subjectId: input.subjectId ?? null,
      topic: input.topic ?? null,
      aliasesJson: JSON.stringify(aliases),
      prerequisiteJson: JSON.stringify(prerequisiteSlugs),
      now,
    });
    return {
      id: String(existing.id),
      slug,
      name,
      description: input.description ?? existing.description ?? undefined,
      subjectId: input.subjectId ?? existing.subject_id ?? undefined,
      topic: input.topic ?? existing.topic ?? undefined,
      aliases,
      prerequisiteSlugs,
    };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO concepts (
       id, slug, name, description, subject_id, topic,
       aliases_json, prerequisite_slugs_json, created_at, updated_at
     ) VALUES (
       @id, @slug, @name, @description, @subjectId, @topic,
       @aliasesJson, @prerequisiteJson, @now, @now
     )`,
  ).run({
    id,
    slug,
    name,
    description: input.description ?? null,
    subjectId: input.subjectId ?? null,
    topic: input.topic ?? null,
    aliasesJson: JSON.stringify(aliases),
    prerequisiteJson: JSON.stringify(prerequisiteSlugs),
    now,
  });

  return {
    id,
    slug,
    name,
    description: input.description,
    subjectId: input.subjectId,
    topic: input.topic,
    aliases,
    prerequisiteSlugs,
  };
}

export function getConcept(db: Db, slug: string): ConceptRecord | null {
  const row = db.prepare('SELECT * FROM concepts WHERE slug = ?').get(normalizeConceptSlug(slug)) as
    | Record<string, string | null>
    | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description ?? undefined,
    subjectId: row.subject_id ?? undefined,
    topic: row.topic ?? undefined,
    aliases: parseJsonArray(row.aliases_json),
    prerequisiteSlugs: parseJsonArray(row.prerequisite_slugs_json),
  };
}

export interface LinkLessonConceptsInput {
  lessonId: string;
  roadmapId?: string;
  lessonNodeId?: string;
  source: 'generated' | 'manual' | 'inferred' | 'diagnostic';
  links: Array<{
    conceptSlug: string;
    cardId?: string;
    skillTag?: string;
    weight?: number;
  }>;
  subjectId?: string;
  topic?: string;
}

/** Links a lesson (and optionally specific cards) to concepts, creating concepts as needed. */
export function linkLessonConcepts(db: Db, input: LinkLessonConceptsInput): { linked: number } {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO lesson_concepts (
       id, lesson_id, roadmap_id, lesson_node_id, card_id,
       concept_slug, skill_tag, weight, source, created_at
     ) VALUES (
       @id, @lessonId, @roadmapId, @lessonNodeId, @cardId,
       @conceptSlug, @skillTag, @weight, @source, @createdAt
     )
     ON CONFLICT(lesson_id, IFNULL(card_id, ''), concept_slug) DO UPDATE SET
       skill_tag = COALESCE(excluded.skill_tag, skill_tag),
       weight = excluded.weight,
       source = excluded.source`,
  );

  let linked = 0;
  const run = db.transaction(() => {
    for (const link of input.links) {
      const conceptSlug = normalizeConceptSlug(link.conceptSlug);
      if (!conceptSlug) continue;
      upsertConcept(db, {
        slug: conceptSlug,
        name: conceptNameFromSlug(conceptSlug),
        subjectId: input.subjectId,
        topic: input.topic,
      });
      insert.run({
        id: randomUUID(),
        lessonId: input.lessonId,
        roadmapId: input.roadmapId ?? null,
        lessonNodeId: input.lessonNodeId ?? null,
        cardId: link.cardId ?? null,
        conceptSlug,
        skillTag: link.skillTag ?? null,
        weight: typeof link.weight === 'number' ? link.weight : 1.0,
        source: input.source,
        createdAt: now,
      });
      linked += 1;
    }
  });
  run();

  return { linked };
}

export function listLessonConcepts(
  db: Db,
  filters: { lessonId?: string; roadmapId?: string; conceptSlug?: string; limit?: number } = {},
) {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.lessonId) {
    clauses.push('lesson_id = @lessonId');
    params.lessonId = filters.lessonId;
  }
  if (filters.roadmapId) {
    clauses.push('roadmap_id = @roadmapId');
    params.roadmapId = filters.roadmapId;
  }
  if (filters.conceptSlug) {
    clauses.push('concept_slug = @conceptSlug');
    params.conceptSlug = normalizeConceptSlug(filters.conceptSlug);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);

  return db
    .prepare(`SELECT * FROM lesson_concepts ${where} ORDER BY created_at DESC LIMIT ${limit}`)
    .all(params) as Array<Record<string, unknown>>;
}

interface LessonLike {
  id?: string;
  title?: string;
  topic?: string;
  conceptTags?: unknown;
  cards?: unknown;
}

function keywordSlugs(text: string, limit: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    const slug = normalizeConceptSlug(word);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Best-effort concept tags for a lesson: explicit lesson tags, then card tags,
 * then keywords from title/topic. Always returns at least one slug.
 */
export function inferConceptTagsFromLesson(lesson: LessonLike): string[] {
  const explicit = Array.isArray(lesson.conceptTags)
    ? lesson.conceptTags
        .filter((t): t is string => typeof t === 'string')
        .map(normalizeConceptSlug)
        .filter(Boolean)
    : [];
  if (explicit.length > 0) return [...new Set(explicit)];

  const cards = Array.isArray(lesson.cards) ? (lesson.cards as Array<Record<string, unknown>>) : [];
  const fromCards = cards
    .flatMap((c) => (Array.isArray(c.conceptTags) ? (c.conceptTags as unknown[]) : []))
    .filter((t): t is string => typeof t === 'string')
    .map(normalizeConceptSlug)
    .filter(Boolean);
  if (fromCards.length > 0) return [...new Set(fromCards)];

  const inferred = keywordSlugs(`${lesson.title ?? ''} ${lesson.topic ?? ''}`, 3);
  return inferred.length > 0 ? inferred : ['general'];
}

/** Concept tags for one card, falling back to lesson-level tags then card text. */
export function inferConceptTagsFromCard(
  card: Record<string, unknown>,
  lessonConceptTags: string[],
  lessonTitle = '',
): string[] {
  const explicit = Array.isArray(card.conceptTags)
    ? (card.conceptTags as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .map(normalizeConceptSlug)
        .filter(Boolean)
    : [];
  if (explicit.length > 0) return [...new Set(explicit)];
  if (lessonConceptTags.length > 0) return lessonConceptTags.slice(0, 3);

  const text = ['title', 'question', 'prompt', 'misconception', 'statement']
    .map((f) => (typeof card[f] === 'string' ? (card[f] as string) : ''))
    .filter(Boolean)
    .join(' ');
  const inferred = keywordSlugs(`${text} ${lessonTitle}`, 2);
  return inferred.length > 0 ? inferred : ['general'];
}
