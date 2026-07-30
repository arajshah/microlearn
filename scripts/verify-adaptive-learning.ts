#!/usr/bin/env npx tsx
/**
 * End-to-end verification for Adaptive Learning v1 + Learning Telemetry v1.
 * Runs against a throwaway in-memory SQLite database, so it never touches local data.
 */
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../server/src/db/schema';
import {
  inferConceptTagsFromCard,
  inferConceptTagsFromLesson,
  linkLessonConcepts,
  normalizeConceptSlug,
  upsertConcept,
} from '../server/src/adaptive/concepts';
import {
  getEventStats,
  listLearningEvents,
  recordCardAnswered,
  recordLearningEventsBatch,
  recordLessonCompleted,
  weaknessTagForCardType,
} from '../server/src/adaptive/events';
import {
  getConceptMastery,
  getDueConceptReviews,
  getWeakConcepts,
  listConceptMastery,
  listWeaknesses,
  recomputeConceptMastery,
  resolveWeakness,
} from '../server/src/adaptive/mastery';
import {
  createDiagnosticSession,
  finishDiagnosticSession,
  hasCompletedDiagnostic,
  submitDiagnosticAnswer,
} from '../server/src/adaptive/diagnostics';
import {
  listRemediationQueue,
  markRemediationGenerated,
  recommendRemediationForWeaknesses,
} from '../server/src/adaptive/remediation';
import {
  buildCurrentLearningSnapshot,
  buildRoadmapLearningSnapshot,
  getLearningState,
  recommendNextLearningAction,
  storeLearningSnapshot,
} from '../server/src/adaptive/snapshots';
import { normalizeConceptSlug as clientSlug } from '../src/utils/conceptTags';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
for (const migration of MIGRATIONS) {
  db.exec(migration.sql);
}

// ---- Slug normalization (must match between client and server) ----
const slugCases: Array<[string, string]> = [
  ['Fourier Transform', 'fourier-transform'],
  ['  Big-O   Notation!  ', 'big-o-notation'],
  ['Gradient—Descent', 'gradient-descent'],
  ['Naïve Bayes', 'naive-bayes'],
];
for (const [input, expected] of slugCases) {
  assert(
    normalizeConceptSlug(input) === expected,
    `server slug "${input}" → "${normalizeConceptSlug(input)}", expected "${expected}"`,
  );
  assert(
    clientSlug(input) === expected,
    `client slug "${input}" → "${clientSlug(input)}", expected "${expected}"`,
  );
}

// ---- Concept upsert + lesson linking ----
const concept = upsertConcept(db, { name: 'Fourier Transform', topic: 'Signals' });
assert(concept.slug === 'fourier-transform', 'concept slug mismatch');
upsertConcept(db, { name: 'Fourier Transform', description: 'Frequency decomposition.' });
const conceptCount = (db.prepare('SELECT COUNT(*) AS n FROM concepts').get() as { n: number }).n;
assert(conceptCount === 1, 'upsertConcept should not duplicate by slug');

const linked = linkLessonConcepts(db, {
  lessonId: 'lesson-1',
  roadmapId: 'roadmap-1',
  lessonNodeId: 'node-1',
  source: 'generated',
  links: [
    { conceptSlug: 'fourier-transform', cardId: 'c1', weight: 1 },
    { conceptSlug: 'Frequency Domain', cardId: 'c2', weight: 0.5 },
  ],
});
assert(linked.linked === 2, 'expected 2 lesson-concept links');
linkLessonConcepts(db, {
  lessonId: 'lesson-1',
  source: 'generated',
  links: [{ conceptSlug: 'fourier-transform', cardId: 'c1' }],
});
const linkRows = (db.prepare('SELECT COUNT(*) AS n FROM lesson_concepts').get() as { n: number }).n;
assert(linkRows === 2, 'lesson-concept links should be idempotent per (lesson, card, concept)');

// ---- Tag inference ----
assert(
  inferConceptTagsFromLesson({ conceptTags: ['Fourier Transform'] })[0] === 'fourier-transform',
  'explicit lesson tags should win',
);
assert(
  inferConceptTagsFromLesson({
    cards: [{ conceptTags: ['convolution-theorem'] }],
  })[0] === 'convolution-theorem',
  'card tags should be used when lesson tags are absent',
);
const inferredFromTitle = inferConceptTagsFromLesson({ title: 'Understanding Laplace Transforms' });
assert(inferredFromTitle.length > 0 && inferredFromTitle[0] !== 'general', 'title inference failed');
assert(
  inferConceptTagsFromCard({ question: 'What is entropy?' }, [], '').length > 0,
  'card inference should always return a tag',
);
assert(weaknessTagForCardType('formula') === 'formula_interpretation', 'formula weakness tag');
assert(weaknessTagForCardType('ordering') === 'sequence_process', 'ordering weakness tag');
assert(weaknessTagForCardType('unknown-type') === 'general_understanding', 'fallback weakness tag');

// ---- Correct answer increases mastery ----
const before = getConceptMastery(db, 'fourier-transform');
assert(before === null, 'mastery should not exist before any events');

recordCardAnswered(db, {
  lessonId: 'lesson-1',
  cardId: 'c1',
  roadmapId: 'roadmap-1',
  lessonNodeId: 'node-1',
  correct: true,
  conceptTags: ['fourier-transform'],
  cardType: 'quiz',
  difficulty: 4,
  lessonTitle: 'Fourier Basics',
});
const afterCorrect = getConceptMastery(db, 'fourier-transform');
assert(afterCorrect !== null, 'mastery row should exist after a graded event');
assert(afterCorrect!.masteryScore > 0, `mastery should increase, got ${afterCorrect!.masteryScore}`);
assert(afterCorrect!.correctCount === 1, 'correct count should be 1');
assert(afterCorrect!.streakCorrect === 1, 'streak should be 1');
assert(afterCorrect!.nextReviewAt !== undefined, 'a review date should be scheduled');

// Harder correct answers gain more than easier ones.
recordCardAnswered(db, {
  lessonId: 'lesson-1',
  cardId: 'ce',
  correct: true,
  conceptTags: ['easy-concept'],
  cardType: 'quiz',
  difficulty: 1,
});
recordCardAnswered(db, {
  lessonId: 'lesson-1',
  cardId: 'ch',
  correct: true,
  conceptTags: ['hard-concept'],
  cardType: 'quiz',
  difficulty: 5,
});
const easyGain = getConceptMastery(db, 'easy-concept')!.masteryScore;
const hardGain = getConceptMastery(db, 'hard-concept')!.masteryScore;
assert(hardGain > easyGain, `hard correct (${hardGain}) should gain more than easy (${easyGain})`);

// ---- Incorrect answer creates a weakness ----
const missResult = recordCardAnswered(db, {
  lessonId: 'lesson-1',
  cardId: 'c3',
  roadmapId: 'roadmap-1',
  lessonNodeId: 'node-1',
  correct: false,
  conceptTags: ['frequency-domain'],
  cardType: 'formula',
  difficulty: 2,
  lessonTitle: 'Fourier Basics',
});
assert(missResult.weaknessesCreated.length === 1, 'a miss should create one weakness observation');

const weaknesses = listWeaknesses(db, { status: 'active' });
assert(weaknesses.length === 1, `expected 1 active weakness, got ${weaknesses.length}`);
assert(weaknesses[0].conceptSlug === 'frequency-domain', 'weakness concept mismatch');
assert(
  weaknesses[0].weaknessTag === 'formula_interpretation',
  `weakness tag should be inferred from card type, got ${weaknesses[0].weaknessTag}`,
);
assert(weaknesses[0].evidenceEventIds.length === 1, 'weakness should cite its evidence event');
assert(Boolean(weaknesses[0].recommendedAction), 'weakness should carry a recommended action');

// Repeat misses escalate severity and open remediation.
const firstSeverity = weaknesses[0].severity;
recordCardAnswered(db, {
  lessonId: 'lesson-1',
  cardId: 'c3',
  correct: false,
  conceptTags: ['frequency-domain'],
  cardType: 'formula',
});
const escalated = listWeaknesses(db, { status: 'active', conceptSlug: 'frequency-domain' })[0];
assert(escalated.severity > firstSeverity, 'repeat misses should raise severity');
assert(escalated.evidenceEventIds.length === 2, 'both misses should be cited as evidence');

const queue = listRemediationQueue(db, { status: 'open' });
assert(queue.length >= 1, 'high severity should queue remediation');
assert(queue[0].conceptSlug === 'frequency-domain', 'remediation concept mismatch');

// Duplicate open remediation is escalated, not duplicated.
recordCardAnswered(db, {
  lessonId: 'lesson-1',
  cardId: 'c3',
  correct: false,
  conceptTags: ['frequency-domain'],
  cardType: 'formula',
});
assert(
  listRemediationQueue(db, { status: 'open' }).filter((r) => r.conceptSlug === 'frequency-domain')
    .length === 1,
  'remediation queue should hold one open item per concept',
);

// ---- Weak concepts and due reviews ----
const weak = getWeakConcepts(db, 10);
assert(
  weak.some((w) => w.conceptSlug === 'frequency-domain'),
  'missed concept should appear in weak concepts',
);

// Force a past review date to prove the due query works.
db.prepare('UPDATE concept_mastery SET next_review_at = ? WHERE concept_slug = ?').run(
  new Date(Date.now() - 86_400_000).toISOString(),
  'frequency-domain',
);
const due = getDueConceptReviews(db, 10);
assert(
  due.some((d) => d.conceptSlug === 'frequency-domain'),
  'past-dated concept should be due for review',
);

const sortedWeakest = listConceptMastery(db, { sort: 'weakest', limit: 5 });
assert(sortedWeakest.length > 0, 'weakest sort returned nothing');
assert(
  sortedWeakest[0].masteryScore <= sortedWeakest[sortedWeakest.length - 1].masteryScore,
  'weakest sort should be ascending by mastery',
);

// ---- Batch events + lesson completion ----
recordLessonCompleted(db, {
  lessonId: 'lesson-1',
  roadmapId: 'roadmap-1',
  lessonNodeId: 'node-1',
  conceptTags: ['fourier-transform', 'frequency-domain'],
  correctCount: 3,
  totalCount: 4,
  accuracy: 0.75,
  lessonTitle: 'Fourier Basics',
});
const batch = recordLearningEventsBatch(db, [
  { eventType: 'lesson_started', lessonId: 'lesson-2', conceptTags: ['sampling-theorem'] },
  { eventType: 'card_viewed', lessonId: 'lesson-2', cardId: 'c1', conceptTags: ['sampling-theorem'] },
  { eventType: 'card_answered', lessonId: 'lesson-2', cardId: 'c2', correct: true, conceptTags: ['sampling-theorem'] },
]);
assert(batch.recorded === 3, `batch should record 3 events, got ${batch.recorded}`);

const stats = getEventStats(db);
assert(stats.lessonsCompleted === 1, `distinct lessons completed should be 1, got ${stats.lessonsCompleted}`);
assert(stats.cardsAnswered > 0 && stats.accuracy !== null, 'event stats should report accuracy');

const filtered = listLearningEvents(db, { conceptSlug: 'sampling-theorem', limit: 10 });
assert(filtered.length === 3, `concept filter should return 3 events, got ${filtered.length}`);
assert(
  listLearningEvents(db, { eventType: 'card_answered', limit: 50 }).every(
    (e) => e.eventType === 'card_answered',
  ),
  'event type filter leaked other types',
);

// A non-graded event must not change correct/incorrect counts.
const beforeView = getConceptMastery(db, 'sampling-theorem')!;
recordLearningEventsBatch(db, [
  { eventType: 'card_viewed', lessonId: 'lesson-2', cardId: 'c9', conceptTags: ['sampling-theorem'] },
]);
const afterView = getConceptMastery(db, 'sampling-theorem')!;
assert(afterView.correctCount === beforeView.correctCount, 'card_viewed must not count as correct');
assert(afterView.exposureCount === beforeView.exposureCount + 1, 'card_viewed should add exposure');
assert(afterView.confidenceScore >= beforeView.confidenceScore, 'exposure should not lower confidence');

// ---- Mastery recompute is deterministic ----
const liveMastery = getConceptMastery(db, 'sampling-theorem')!;
const recomputed = recomputeConceptMastery(db, 'sampling-theorem')!;
assert(
  Math.abs(recomputed.masteryScore - liveMastery.masteryScore) < 1e-6,
  `recompute drifted: ${recomputed.masteryScore} vs ${liveMastery.masteryScore}`,
);

// ---- Diagnostics ----
const now = new Date().toISOString();
db.prepare(
  `INSERT INTO roadmaps (id, title, topic, goal, description, mastery_level, depth, status,
     estimated_total_minutes, created_at, updated_at)
   VALUES ('roadmap-1', 'Signals & Systems', 'Signal Processing', 'Understand transforms', '', 3,
     'standard', 'published', 120, ?, ?)`,
).run(now, now);
db.prepare(
  `INSERT INTO roadmap_units (id, roadmap_id, title, description, unit_order, created_at, updated_at)
   VALUES ('unit-1', 'roadmap-1', 'Foundations', '', 0, ?, ?)`,
).run(now, now);
for (const [i, title] of ['Sampling Theorem', 'Fourier Series', 'Convolution'].entries()) {
  db.prepare(
    `INSERT INTO lesson_nodes (id, roadmap_id, unit_id, title, short_description, learning_objective,
       estimated_minutes, difficulty, node_order, prerequisite_ids_json, key_ideas_json, status,
       created_at, updated_at)
     VALUES (?, 'roadmap-1', 'unit-1', ?, '', ?, 8, 3, ?, '[]', '[]', ?, ?, ?)`,
  ).run(
    `node-d${i}`,
    title,
    `Explain how ${title} works and when to apply it.`,
    i,
    i === 0 ? 'available' : 'locked',
    now,
    now,
  );
}

assert(!hasCompletedDiagnostic(db, 'roadmap-1'), 'no diagnostic should be complete yet');
const session = createDiagnosticSession(db, { roadmapId: 'roadmap-1', conceptCount: 3 });
assert(session.items.length === 3, `expected 3 diagnostic items, got ${session.items.length}`);
for (const item of session.items) {
  assert(item.options.length >= 2, 'diagnostic item needs at least 2 options');
  assert(
    item.answerIndex >= 0 && item.answerIndex < item.options.length,
    'diagnostic answerIndex out of range',
  );
  assert(item.conceptSlug.length > 0, 'diagnostic item missing concept slug');
}
assert(
  new Set(session.items.map((i) => i.answerIndex)).size > 1,
  'correct answer position should rotate across items',
);

const firstAnswer = submitDiagnosticAnswer(db, {
  sessionId: session.id,
  itemId: session.items[0].id,
  selectedIndex: session.items[0].answerIndex,
  responseTimeMs: 4200,
});
assert(firstAnswer.correct, 'answering with answerIndex should be graded correct');
assert(firstAnswer.mastery !== null, 'diagnostic answer should update mastery');

submitDiagnosticAnswer(db, {
  sessionId: session.id,
  itemId: session.items[1].id,
  selectedIndex: (session.items[1].answerIndex + 1) % session.items[1].options.length,
});

const diagnosticSummary = finishDiagnosticSession(db, session.id);
assert(diagnosticSummary.answeredCount === 2, 'two items were answered');
assert(diagnosticSummary.correctCount === 1, 'one item was correct');
assert(diagnosticSummary.strengths.length === 1, 'one strength expected');
assert(diagnosticSummary.weaknesses.length === 1, 'one weakness expected');
assert(hasCompletedDiagnostic(db, 'roadmap-1'), 'diagnostic should now be marked complete');

// ---- Recommendation ladder ----
// Later events rescheduled reviews forward, so re-age one concept for this check.
db.prepare('UPDATE concept_mastery SET next_review_at = ? WHERE concept_slug = ?').run(
  new Date(Date.now() - 86_400_000).toISOString(),
  'frequency-domain',
);
const actions = recommendNextLearningAction(db, { roadmapId: 'roadmap-1', availableMinutes: 15 });
assert(actions.length > 0, 'recommendation returned nothing');
assert(
  actions[0].action === 'generate_remediation',
  `severe weakness should outrank other actions, got ${actions[0].action}`,
);
assert(actions[0].reason.length > 0, 'recommendation must carry a reason');
assert(Object.keys(actions[0].evidence).length > 0, 'recommendation must carry evidence');
assert(
  actions.some((a) => a.action === 'review_due_concepts'),
  'due reviews should appear as an alternative',
);
assert(
  actions.some((a) => a.action === 'continue_lesson'),
  'continue_lesson should appear as an alternative',
);

// With weaknesses resolved and reviews pushed out, the ladder falls back to continuing.
for (const w of listWeaknesses(db, { status: 'active', limit: 50 })) {
  resolveWeakness(db, { id: w.id, status: 'resolved' });
}
db.prepare('UPDATE concept_mastery SET next_review_at = ?').run(
  new Date(Date.now() + 7 * 86_400_000).toISOString(),
);
const calmActions = recommendNextLearningAction(db, { roadmapId: 'roadmap-1' });
assert(
  calmActions[0].action === 'continue_lesson',
  `with no weaknesses or due reviews expected continue_lesson, got ${calmActions[0].action}`,
);

// ---- Snapshot content ----
const snapshot = buildCurrentLearningSnapshot(db);
assert(snapshot.snapshotType === 'current_state', 'snapshot type mismatch');
assert(snapshot.summary.length > 0, 'snapshot summary is empty');
assert(snapshot.stats.lessonsCompleted === 1, 'snapshot lesson count mismatch');
assert(snapshot.stats.activeConcepts > 0, 'snapshot should report active concepts');
assert(snapshot.recentActivity.length > 0, 'snapshot should include recent activity');
assert(
  snapshot.recentActivity.every((a) => Boolean(a.eventId)),
  'snapshot activity must cite event ids',
);
assert(snapshot.recommendedNextActions.length > 0, 'snapshot should recommend an action');
assert(snapshot.openRemediations.length > 0, 'snapshot should surface open remediation');

const stored = storeLearningSnapshot(db, snapshot);
assert(Boolean(stored.id), 'stored snapshot should have an id');
const storedRow = db
  .prepare('SELECT snapshot_type, summary FROM learning_snapshots WHERE id = ?')
  .get(stored.id) as { snapshot_type: string; summary: string };
assert(storedRow.snapshot_type === 'current_state', 'stored snapshot type mismatch');
assert(storedRow.summary === snapshot.summary, 'stored snapshot summary mismatch');

const roadmapSnapshot = buildRoadmapLearningSnapshot(db, 'roadmap-1');
assert(roadmapSnapshot.title.includes('roadmap-1'), 'roadmap snapshot title should name the roadmap');

// ---- MCP payload compactness ----
const state = getLearningState(db, { limit: 5 });
assert(Boolean(state.summary), 'learning state needs a summary');
assert(Boolean(state.recommendedNextAction), 'learning state needs a recommended action');
assert(state.recentEvents === undefined, 'raw events must be opt-in');
assert(Array.isArray(state.recentActivity), 'compact recentActivity should be present by default');

const compactBytes = JSON.stringify(state).length;
assert(compactBytes < 8000, `default MCP payload too large: ${compactBytes} bytes`);

const verboseBytes = JSON.stringify(
  getLearningState(db, { includeEvents: true, includeWeaknesses: true, limit: 50 }),
).length;
assert(verboseBytes > compactBytes, 'opt-in sections should increase payload size');

// ---- Remediation lifecycle ----
const recommended = recommendRemediationForWeaknesses(db, { severityMin: 0 });
assert(recommended.consideredWeaknesses === 0, 'resolved weaknesses should not be reconsidered');

const openItem = listRemediationQueue(db, { status: 'open' })[0];
assert(Boolean(openItem), 'expected an open remediation item');
const generated = markRemediationGenerated(db, {
  id: openItem.id,
  generatedLessonId: 'remediation-lesson-1',
});
assert(generated?.status === 'generated', 'remediation should transition to generated');
assert(generated?.generatedLessonId === 'remediation-lesson-1', 'generated lesson id not stored');

db.close();

console.log('Adaptive learning verification passed.');
