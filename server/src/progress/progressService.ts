import type { Db } from '../db';
import { getRoadmapDetailed } from '../curriculum/curriculumRepository';
import { serializeOutcome, type OutcomeRow } from '../curriculum/curriculumSerialization';

interface ParsedOutcome {
  row: OutcomeRow;
  accuracy?: number;
  mistakes: string[];
  unresolved: string[];
  objective?: string;
  concepts: string[];
}

function parseOutcomeRow(row: OutcomeRow): ParsedOutcome {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.outcome_json) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  const mistakesRaw = payload.mistakes;
  const mistakes: string[] = [];
  if (Array.isArray(mistakesRaw)) {
    for (const m of mistakesRaw) {
      if (typeof m === 'string') mistakes.push(m);
      else if (m && typeof m === 'object' && typeof (m as { concept?: string }).concept === 'string') {
        mistakes.push((m as { concept: string }).concept);
      }
    }
  }
  const unresolved = Array.isArray(payload.unresolvedQuestions)
    ? payload.unresolvedQuestions.filter((x): x is string => typeof x === 'string')
    : [];
  const concepts = Array.isArray(payload.conceptsCovered)
    ? payload.conceptsCovered.filter((x): x is string => typeof x === 'string')
    : [];
  const accuracy = typeof payload.accuracy === 'number' ? payload.accuracy : undefined;
  const objective =
    typeof payload.objective === 'string'
      ? payload.objective
      : typeof payload.learningObjective === 'string'
        ? payload.learningObjective
        : undefined;
  return { row, accuracy, mistakes, unresolved, objective, concepts };
}

function loadParsedOutcomes(db: Db, roadmapId?: string): ParsedOutcome[] {
  const rows = roadmapId
    ? (db.prepare('SELECT * FROM lesson_outcomes WHERE roadmap_id = ? ORDER BY created_at DESC').all(roadmapId) as OutcomeRow[])
    : (db.prepare('SELECT * FROM lesson_outcomes ORDER BY created_at DESC LIMIT 500').all() as OutcomeRow[]);
  return rows.map(parseOutcomeRow);
}

export function getProgressSummary(db: Db, roadmapId?: string) {
  const parsed = loadParsedOutcomes(db, roadmapId);
  const accuracies = parsed.map((p) => p.accuracy).filter((a): a is number => typeof a === 'number');
  const averageAccuracy =
    accuracies.length > 0 ? accuracies.reduce((s, a) => s + a, 0) / accuracies.length : null;

  const recentCompleted = parsed.slice(0, 10).map((p) => ({
    outcomeId: p.row.id,
    roadmapId: p.row.roadmap_id,
    lessonNodeId: p.row.lesson_node_id,
    lessonId: p.row.lesson_id ?? undefined,
    completedAt: p.row.completed_at ?? undefined,
    accuracy: p.accuracy,
    objective: p.objective,
  }));

  const weakConcepts = new Map<string, number>();
  for (const p of parsed) {
    for (const m of p.mistakes) weakConcepts.set(m, (weakConcepts.get(m) ?? 0) + 1);
  }
  const repeatedWeakConcepts = [...weakConcepts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([concept, count]) => ({ concept, count }));

  const unresolvedQuestions = parsed
    .flatMap((p) => p.unresolved.map((q) => ({ lessonNodeId: p.row.lesson_node_id, question: q })))
    .slice(0, 20);

  return {
    roadmapId: roadmapId ?? null,
    completedLessonCount: parsed.length,
    totalOutcomes: parsed.length,
    averageAccuracy,
    recentCompletedLessons: recentCompleted,
    repeatedWeakConcepts,
    unresolvedQuestions,
  };
}

export interface RevisionTarget {
  lessonNodeId: string;
  roadmapId: string;
  reasons: string[];
  latestAccuracy?: number;
  mistakeCount: number;
  unresolvedCount: number;
}

export function getRevisionTargets(db: Db, roadmapId: string, limit = 10): RevisionTarget[] {
  const parsed = loadParsedOutcomes(db, roadmapId);
  const byNode = new Map<string, ParsedOutcome[]>();
  for (const p of parsed) {
    if (!byNode.has(p.row.lesson_node_id)) byNode.set(p.row.lesson_node_id, []);
    byNode.get(p.row.lesson_node_id)!.push(p);
  }

  const targets: RevisionTarget[] = [];
  for (const [lessonNodeId, outcomes] of byNode) {
    const latest = outcomes[0];
    const reasons: string[] = [];
    if (latest.accuracy !== undefined && latest.accuracy < 0.7) {
      reasons.push(`Low accuracy (${Math.round(latest.accuracy * 100)}%)`);
    }
    const mistakeCount = latest.mistakes.length;
    if (mistakeCount >= 2) reasons.push(`${mistakeCount} mistakes recorded`);
    const unresolvedCount = latest.unresolved.length;
    if (unresolvedCount > 0) reasons.push(`${unresolvedCount} unresolved question(s)`);
    if (reasons.length === 0) continue;
    targets.push({
      lessonNodeId,
      roadmapId,
      reasons,
      latestAccuracy: latest.accuracy,
      mistakeCount,
      unresolvedCount,
    });
  }

  return targets
    .sort((a, b) => {
      const score = (t: RevisionTarget) =>
        (t.latestAccuracy !== undefined && t.latestAccuracy < 0.7 ? 2 : 0) +
        t.mistakeCount +
        t.unresolvedCount;
      return score(b) - score(a);
    })
    .slice(0, Math.min(Math.max(limit, 1), 50));
}

export function suggestLessonRevision(db: Db, roadmapId: string, lessonNodeId: string) {
  const roadmap = getRoadmapDetailed(db, roadmapId, {
    includeBlueprints: true,
    includeLessons: true,
    includeOutcomes: true,
  }) as Record<string, unknown>;

  const units = (roadmap.units as Array<{ lessons: Array<Record<string, unknown>> }>) ?? [];
  const node = units.flatMap((u) => u.lessons).find((l) => l.id === lessonNodeId);
  if (!node) {
    return { found: false, message: `Lesson node "${lessonNodeId}" not found in roadmap.` };
  }

  const nodeOutcomes = loadParsedOutcomes(db, roadmapId).filter((p) => p.row.lesson_node_id === lessonNodeId);
  const latestOutcome = nodeOutcomes[0];
  const blueprints = (roadmap.blueprints as Array<Record<string, unknown>> | undefined)?.filter(
    (b) => b.lessonNodeId === lessonNodeId,
  );
  const lessons = (roadmap.lessons as Array<Record<string, unknown>> | undefined)?.filter(
    (l) => l.lessonNodeId === lessonNodeId,
  );

  const recommendations: string[] = [];
  if (latestOutcome?.accuracy !== undefined && latestOutcome.accuracy < 0.7) {
    recommendations.push('Add more scaffolded practice for weak areas and clearer explanations before assessment.');
  }
  if (latestOutcome && latestOutcome.mistakes.length > 0) {
    recommendations.push(`Reinforce concepts where mistakes occurred: ${latestOutcome.mistakes.slice(0, 5).join(', ')}.`);
  }
  if (latestOutcome && latestOutcome.unresolved.length > 0) {
    recommendations.push('Address unresolved learner questions explicitly in a recap section.');
  }
  if (recommendations.length === 0) {
    recommendations.push('No strong revision signals in stored outcomes; consider minor clarity polish only.');
  }

  return {
    found: true,
    roadmapId,
    lessonNodeId,
    node,
    latestBlueprint: blueprints?.[0],
    latestGeneratedLesson: lessons?.[0],
    latestOutcome: latestOutcome ? serializeOutcome(latestOutcome.row) : null,
    recommendations,
    suggestedFocusAreas: latestOutcome?.mistakes.slice(0, 5) ?? [],
    note: 'Read-only suggestion context for ChatGPT; no content was modified.',
  };
}
