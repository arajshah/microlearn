import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { conceptNameFromSlug, normalizeConceptSlug, upsertConcept } from './concepts';
import { recordLearningEvent } from './events';
import { getConceptMastery } from './mastery';

export interface DiagnosticItem {
  id: string;
  sessionId: string;
  conceptSlug: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
  cognitiveLevel?: string;
  difficulty?: number;
  answeredCorrectly?: boolean;
  selectedIndex?: number;
  responseTimeMs?: number;
  answeredAt?: string;
}

export interface DiagnosticSession {
  id: string;
  roadmapId?: string;
  topic: string;
  goal?: string;
  masteryLevel?: number;
  status: 'started' | 'completed' | 'abandoned';
  startedAt: string;
  completedAt?: string;
  summary?: Record<string, unknown>;
  items: DiagnosticItem[];
}

interface NodeRow {
  id: string;
  title: string;
  learning_objective: string | null;
  key_ideas_json: string | null;
  difficulty: number | null;
  node_order: number;
}

function parseKeyIdeas(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function serializeItem(row: Record<string, unknown>): DiagnosticItem {
  let options: string[] = [];
  try {
    const parsed = JSON.parse(String(row.options_json ?? '[]')) as unknown;
    if (Array.isArray(parsed)) options = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    options = [];
  }
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    conceptSlug: String(row.concept_slug),
    question: String(row.question),
    options,
    answerIndex: Number(row.answer_index),
    explanation: (row.explanation as string | null) ?? undefined,
    cognitiveLevel: (row.cognitive_level as string | null) ?? undefined,
    difficulty: (row.difficulty as number | null) ?? undefined,
    answeredCorrectly:
      row.answered_correctly == null ? undefined : Number(row.answered_correctly) === 1,
    selectedIndex: (row.selected_index as number | null) ?? undefined,
    responseTimeMs: (row.response_time_ms as number | null) ?? undefined,
    answeredAt: (row.answered_at as string | null) ?? undefined,
  };
}

const GENERIC_DISTRACTORS = [
  'It is only a naming convention with no practical effect.',
  'It applies exclusively to historical examples and not to current work.',
  'It is interchangeable with any other technique in this area.',
];

/**
 * Deterministic v1 diagnostic item builder: one item per lesson node, using the
 * node's learning objective as the correct option and sibling objectives as distractors.
 */
function buildItemsForRoadmap(
  nodes: NodeRow[],
  conceptCount: number,
): Array<Omit<DiagnosticItem, 'id' | 'sessionId'>> {
  const usable = nodes
    .map((node) => ({
      node,
      correct: (node.learning_objective ?? '').trim() || parseKeyIdeas(node.key_ideas_json)[0] || '',
    }))
    .filter((n) => n.correct.length > 0);

  const selected = usable.slice(0, Math.min(Math.max(conceptCount, 1), 20));

  return selected.map(({ node, correct }, index) => {
    const conceptSlug = normalizeConceptSlug(node.title);
    const siblingDistractors = usable
      .filter((u) => u.node.id !== node.id)
      .map((u) => u.correct)
      .filter((text) => text !== correct)
      .slice(0, 2);

    const distractors = [...siblingDistractors];
    for (const generic of GENERIC_DISTRACTORS) {
      if (distractors.length >= 3) break;
      distractors.push(generic);
    }

    // Rotate the correct answer position so it isn't always first.
    const answerIndex = index % (distractors.length + 1);
    const options = [...distractors];
    options.splice(answerIndex, 0, correct);

    return {
      conceptSlug: conceptSlug || `concept-${index + 1}`,
      question: `Which statement best captures "${node.title}"?`,
      options,
      answerIndex,
      explanation: correct,
      cognitiveLevel: 'understand',
      difficulty: node.difficulty ?? 3,
    };
  });
}

export interface CreateDiagnosticInput {
  roadmapId?: string;
  topic?: string;
  goal?: string;
  masteryLevel?: number;
  conceptCount?: number;
}

/** Creates a diagnostic session with deterministic items drawn from roadmap nodes. */
export function createDiagnosticSession(db: Db, input: CreateDiagnosticInput): DiagnosticSession {
  const conceptCount = input.conceptCount ?? 5;
  let topic = input.topic?.trim() ?? '';
  let goal = input.goal;
  let masteryLevel = input.masteryLevel;
  let nodes: NodeRow[] = [];

  if (input.roadmapId) {
    const roadmap = db
      .prepare('SELECT topic, goal, mastery_level FROM roadmaps WHERE id = ?')
      .get(input.roadmapId) as
      | { topic: string; goal: string; mastery_level: number }
      | undefined;
    if (!roadmap) throw new Error(`Roadmap "${input.roadmapId}" not found.`);
    topic = topic || roadmap.topic;
    goal = goal ?? roadmap.goal;
    masteryLevel = masteryLevel ?? roadmap.mastery_level;

    nodes = db
      .prepare(
        `SELECT id, title, learning_objective, key_ideas_json, difficulty, node_order
         FROM lesson_nodes WHERE roadmap_id = ? ORDER BY node_order ASC`,
      )
      .all(input.roadmapId) as NodeRow[];
  }

  if (!topic) throw new Error('A topic or roadmapId is required to create a diagnostic.');

  const sessionId = randomUUID();
  const now = new Date().toISOString();

  const items = buildItemsForRoadmap(nodes, conceptCount);

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO diagnostic_sessions (
         id, roadmap_id, topic, goal, mastery_level, status, started_at, summary_json
       ) VALUES (@id, @roadmapId, @topic, @goal, @masteryLevel, 'started', @now, '{}')`,
    ).run({
      id: sessionId,
      roadmapId: input.roadmapId ?? null,
      topic,
      goal: goal ?? null,
      masteryLevel: masteryLevel ?? null,
      now,
    });

    const insertItem = db.prepare(
      `INSERT INTO diagnostic_items (
         id, session_id, concept_slug, question, options_json, answer_index,
         explanation, cognitive_level, difficulty, created_at
       ) VALUES (
         @id, @sessionId, @conceptSlug, @question, @optionsJson, @answerIndex,
         @explanation, @cognitiveLevel, @difficulty, @now
       )`,
    );

    for (const item of items) {
      upsertConcept(db, {
        slug: item.conceptSlug,
        name: conceptNameFromSlug(item.conceptSlug),
        topic,
      });
      insertItem.run({
        id: randomUUID(),
        sessionId,
        conceptSlug: item.conceptSlug,
        question: item.question,
        optionsJson: JSON.stringify(item.options),
        answerIndex: item.answerIndex,
        explanation: item.explanation ?? null,
        cognitiveLevel: item.cognitiveLevel ?? null,
        difficulty: item.difficulty ?? null,
        now,
      });
    }
  });
  run();

  recordLearningEvent(db, {
    eventType: 'diagnostic_started',
    roadmapId: input.roadmapId,
    source: 'diagnostic',
    metadata: { sessionId, topic, itemCount: items.length },
  });

  return getDiagnosticSession(db, sessionId)!;
}

export function getDiagnosticSession(db: Db, sessionId: string): DiagnosticSession | null {
  const row = db.prepare('SELECT * FROM diagnostic_sessions WHERE id = ?').get(sessionId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  const itemRows = db
    .prepare('SELECT * FROM diagnostic_items WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as Array<Record<string, unknown>>;

  let summary: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(String(row.summary_json ?? '{}')) as unknown;
    if (parsed && typeof parsed === 'object') summary = parsed as Record<string, unknown>;
  } catch {
    summary = undefined;
  }

  return {
    id: String(row.id),
    roadmapId: (row.roadmap_id as string | null) ?? undefined,
    topic: String(row.topic),
    goal: (row.goal as string | null) ?? undefined,
    masteryLevel: (row.mastery_level as number | null) ?? undefined,
    status: String(row.status) as DiagnosticSession['status'],
    startedAt: String(row.started_at),
    completedAt: (row.completed_at as string | null) ?? undefined,
    summary,
    items: itemRows.map(serializeItem),
  };
}

export interface DiagnosticAnswerInput {
  sessionId: string;
  itemId: string;
  selectedIndex: number;
  responseTimeMs?: number;
}

/** Records one diagnostic answer and immediately folds it into concept mastery. */
export function submitDiagnosticAnswer(db: Db, input: DiagnosticAnswerInput) {
  const item = db
    .prepare('SELECT * FROM diagnostic_items WHERE id = ? AND session_id = ?')
    .get(input.itemId, input.sessionId) as Record<string, unknown> | undefined;
  if (!item) throw new Error(`Diagnostic item "${input.itemId}" not found in session.`);

  const parsed = serializeItem(item);
  const correct = input.selectedIndex === parsed.answerIndex;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE diagnostic_items
     SET answered_correctly = ?, selected_index = ?, response_time_ms = ?, answered_at = ?
     WHERE id = ?`,
  ).run(correct ? 1 : 0, input.selectedIndex, input.responseTimeMs ?? null, now, input.itemId);

  const session = db
    .prepare('SELECT roadmap_id FROM diagnostic_sessions WHERE id = ?')
    .get(input.sessionId) as { roadmap_id: string | null } | undefined;

  const result = recordLearningEvent(db, {
    eventType: 'diagnostic_answered',
    roadmapId: session?.roadmap_id ?? undefined,
    conceptSlug: parsed.conceptSlug,
    correct,
    selectedAnswer: input.selectedIndex,
    expectedAnswer: parsed.answerIndex,
    responseTimeMs: input.responseTimeMs,
    difficultyRating: parsed.difficulty,
    cardType: 'quiz',
    source: 'diagnostic',
    metadata: { sessionId: input.sessionId, itemId: input.itemId },
  });

  return {
    correct,
    conceptSlug: parsed.conceptSlug,
    explanation: parsed.explanation,
    mastery: getConceptMastery(db, parsed.conceptSlug),
    eventIds: result.events.map((e) => e.id),
  };
}

/** Finalizes a session and returns per-concept strengths and weaknesses. */
export function finishDiagnosticSession(db: Db, sessionId: string) {
  const session = getDiagnosticSession(db, sessionId);
  if (!session) throw new Error(`Diagnostic session "${sessionId}" not found.`);

  const answered = session.items.filter((i) => i.answeredCorrectly !== undefined);
  const correctCount = answered.filter((i) => i.answeredCorrectly).length;
  const accuracy = answered.length > 0 ? Number((correctCount / answered.length).toFixed(4)) : null;

  const strengths = answered.filter((i) => i.answeredCorrectly).map((i) => i.conceptSlug);
  const weaknesses = answered.filter((i) => !i.answeredCorrectly).map((i) => i.conceptSlug);

  const summary = {
    itemCount: session.items.length,
    answeredCount: answered.length,
    correctCount,
    accuracy,
    strengths: [...new Set(strengths)],
    weaknesses: [...new Set(weaknesses)],
  };

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE diagnostic_sessions
     SET status = 'completed', completed_at = ?, summary_json = ?
     WHERE id = ?`,
  ).run(now, JSON.stringify(summary), sessionId);

  recordLearningEvent(db, {
    eventType: 'diagnostic_completed',
    roadmapId: session.roadmapId,
    source: 'diagnostic',
    metadata: { sessionId, ...summary },
  });

  return { sessionId, ...summary };
}

export function listDiagnosticSessions(
  db: Db,
  filters: { roadmapId?: string; status?: string; limit?: number } = {},
) {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.roadmapId) {
    clauses.push('roadmap_id = @roadmapId');
    params.roadmapId = filters.roadmapId;
  }
  if (filters.status) {
    clauses.push('status = @status');
    params.status = filters.status;
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);

  return db
    .prepare(
      `SELECT id, roadmap_id, topic, status, started_at, completed_at, summary_json
       FROM diagnostic_sessions ${where} ORDER BY started_at DESC LIMIT ${limit}`,
    )
    .all(params) as Array<Record<string, unknown>>;
}

/** True when the roadmap has at least one completed diagnostic. */
export function hasCompletedDiagnostic(db: Db, roadmapId: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM diagnostic_sessions WHERE roadmap_id = ? AND status = 'completed'`,
    )
    .get(roadmapId) as { n: number };
  return row.n > 0;
}
