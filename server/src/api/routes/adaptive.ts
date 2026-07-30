import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../../db';
import { parse } from '../http';
import { badRequest, notFound } from '../apiError';
import { listLearningEvents, recordLearningEvent, recordLearningEventsBatch } from '../../adaptive/events';
import {
  getConceptMastery,
  getDueConceptReviews,
  listConceptMastery,
  listWeaknesses,
  resolveWeakness,
} from '../../adaptive/mastery';
import {
  createDiagnosticSession,
  finishDiagnosticSession,
  getDiagnosticSession,
  listDiagnosticSessions,
  submitDiagnosticAnswer,
} from '../../adaptive/diagnostics';
import {
  listRemediationQueue,
  recommendRemediationForWeaknesses,
  updateRemediationStatus,
} from '../../adaptive/remediation';
import {
  buildCurrentLearningSnapshot,
  buildDailyLearningSnapshot,
  buildRoadmapLearningSnapshot,
  listLearningSnapshots,
  storeLearningSnapshot,
} from '../../adaptive/snapshots';
import { LEARNING_EVENT_TYPES, type LearningEventType } from '../../adaptive/types';

const eventTypeSchema = z.enum(
  LEARNING_EVENT_TYPES as unknown as [LearningEventType, ...LearningEventType[]],
);

const learningEventSchema = z.object({
  eventType: eventTypeSchema,
  timestamp: z.string().optional(),
  roadmapId: z.string().optional(),
  lessonNodeId: z.string().optional(),
  lessonId: z.string().optional(),
  cardId: z.string().optional(),
  conceptSlug: z.string().optional(),
  conceptTags: z.array(z.string()).optional(),
  skillTag: z.string().optional(),
  weaknessTags: z.array(z.string()).optional(),
  cardType: z.string().optional(),
  correct: z.boolean().optional(),
  selectedAnswer: z.unknown().optional(),
  expectedAnswer: z.unknown().optional(),
  responseTimeMs: z.number().int().nonnegative().optional(),
  confidence: z.number().int().min(1).max(5).optional(),
  difficultyRating: z.number().int().min(1).max(5).optional(),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const batchSchema = z.object({
  events: z.array(learningEventSchema).min(1).max(200),
});

function intParam(value: unknown, fallback: number): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Learning telemetry, mastery, weakness, and snapshot routes mounted at /api/learning. */
export function createLearningRouter(db: Db): Router {
  const router = Router();

  router.post('/events', (req, res) => {
    const input = parse(learningEventSchema, req.body);
    const result = recordLearningEvent(db, input);
    res.status(201).json({
      recorded: result.events.length,
      eventIds: result.events.map((e) => e.id),
      masteryUpdated: result.masteryUpdated,
      weaknessesCreated: result.weaknessesCreated,
      remediationCreated: result.remediationCreated,
    });
  });

  router.post('/events/batch', (req, res) => {
    const input = parse(batchSchema, req.body);
    const { recorded, results } = recordLearningEventsBatch(db, input.events);
    res.status(201).json({
      recorded,
      eventIds: results.flatMap((r) => r.events.map((e) => e.id)),
      masteryUpdated: [...new Set(results.flatMap((r) => r.masteryUpdated))],
      weaknessesCreated: [...new Set(results.flatMap((r) => r.weaknessesCreated))],
      remediationCreated: [...new Set(results.flatMap((r) => r.remediationCreated))],
    });
  });

  router.get('/events', (req, res) => {
    const events = listLearningEvents(db, {
      eventType: str(req.query.eventType),
      conceptSlug: str(req.query.conceptSlug),
      roadmapId: str(req.query.roadmapId),
      lessonId: str(req.query.lessonId),
      since: str(req.query.since),
      until: str(req.query.until),
      limit: intParam(req.query.limit, 50),
    });
    res.json({ events, count: events.length });
  });

  router.get('/mastery', (req, res) => {
    const sortRaw = str(req.query.sort);
    const sort =
      sortRaw === 'strongest' || sortRaw === 'recent' || sortRaw === 'due' || sortRaw === 'weakest'
        ? sortRaw
        : undefined;
    const mastery = listConceptMastery(db, {
      sort,
      subjectId: str(req.query.subjectId),
      topic: str(req.query.topic),
      limit: intParam(req.query.limit, 50),
    });
    res.json({ mastery, count: mastery.length });
  });

  router.get('/mastery/:conceptSlug', (req, res) => {
    const mastery = getConceptMastery(db, req.params.conceptSlug);
    if (!mastery) throw notFound(`No mastery record for concept "${req.params.conceptSlug}".`);
    res.json({ mastery });
  });

  router.get('/weaknesses', (req, res) => {
    const statusRaw = str(req.query.status);
    const status =
      statusRaw === 'active' || statusRaw === 'resolved' || statusRaw === 'ignored'
        ? statusRaw
        : undefined;
    const severityMinRaw = Number.parseFloat(String(req.query.severityMin ?? ''));
    const weaknesses = listWeaknesses(db, {
      status,
      severityMin: Number.isFinite(severityMinRaw) ? severityMinRaw : undefined,
      conceptSlug: str(req.query.conceptSlug),
      limit: intParam(req.query.limit, 25),
    });
    res.json({ weaknesses, count: weaknesses.length });
  });

  router.patch('/weaknesses/:id', (req, res) => {
    const body = parse(z.object({ status: z.enum(['resolved', 'ignored']) }), req.body);
    const weakness = resolveWeakness(db, { id: req.params.id, status: body.status });
    if (!weakness) throw notFound(`Weakness "${req.params.id}" not found.`);
    res.json({ weakness });
  });

  router.get('/reviews/due', (req, res) => {
    const concepts = getDueConceptReviews(db, intParam(req.query.limit, 20));
    res.json({ concepts, count: concepts.length });
  });

  router.get('/snapshot/current', (_req, res) => {
    res.json({ snapshot: buildCurrentLearningSnapshot(db) });
  });

  router.get('/snapshots', (req, res) => {
    const typeRaw = str(req.query.type);
    const snapshotType =
      typeRaw === 'daily' || typeRaw === 'weekly' || typeRaw === 'roadmap' || typeRaw === 'current_state'
        ? typeRaw
        : undefined;
    res.json({ snapshots: listLearningSnapshots(db, { snapshotType, limit: intParam(req.query.limit, 10) }) });
  });

  router.post('/snapshot', (req, res) => {
    const body = parse(
      z.object({
        type: z.enum(['current_state', 'daily', 'roadmap']).optional(),
        roadmapId: z.string().optional(),
      }),
      req.body ?? {},
    );
    const type = body.type ?? 'current_state';
    if (type === 'roadmap' && !body.roadmapId) {
      throw badRequest('roadmapId is required for roadmap snapshots.');
    }
    const snapshot =
      type === 'daily'
        ? buildDailyLearningSnapshot(db)
        : type === 'roadmap'
          ? buildRoadmapLearningSnapshot(db, body.roadmapId!)
          : buildCurrentLearningSnapshot(db);
    res.status(201).json({ snapshot: storeLearningSnapshot(db, snapshot) });
  });

  return router;
}

/** Diagnostic quiz routes mounted at /api/diagnostics. */
export function createDiagnosticsRouter(db: Db): Router {
  const router = Router();

  router.post('/sessions', (req, res) => {
    const body = parse(
      z
        .object({
          roadmapId: z.string().optional(),
          topic: z.string().optional(),
          goal: z.string().optional(),
          masteryLevel: z.number().int().min(1).max(5).optional(),
          conceptCount: z.number().int().min(1).max(20).optional(),
        })
        .refine((v) => Boolean(v.roadmapId || v.topic), {
          message: 'Either roadmapId or topic is required.',
        }),
      req.body ?? {},
    );
    res.status(201).json({ session: createDiagnosticSession(db, body) });
  });

  router.get('/sessions', (req, res) => {
    res.json({
      sessions: listDiagnosticSessions(db, {
        roadmapId: str(req.query.roadmapId),
        status: str(req.query.status),
        limit: intParam(req.query.limit, 20),
      }),
    });
  });

  router.get('/sessions/:sessionId', (req, res) => {
    const session = getDiagnosticSession(db, req.params.sessionId);
    if (!session) throw notFound(`Diagnostic session "${req.params.sessionId}" not found.`);
    res.json({ session });
  });

  router.post('/sessions/:sessionId/answer', (req, res) => {
    const body = parse(
      z.object({
        itemId: z.string().min(1),
        selectedIndex: z.number().int().min(0),
        responseTimeMs: z.number().int().nonnegative().optional(),
      }),
      req.body,
    );
    res.status(201).json(
      submitDiagnosticAnswer(db, {
        sessionId: req.params.sessionId,
        itemId: body.itemId,
        selectedIndex: body.selectedIndex,
        responseTimeMs: body.responseTimeMs,
      }),
    );
  });

  router.patch('/sessions/:sessionId/finish', (req, res) => {
    res.json({ result: finishDiagnosticSession(db, req.params.sessionId) });
  });

  return router;
}

/** Remediation queue routes mounted at /api/remediation. */
export function createRemediationRouter(db: Db): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const statusRaw = str(req.query.status);
    const status =
      statusRaw === 'open' || statusRaw === 'generated' || statusRaw === 'dismissed' || statusRaw === 'resolved'
        ? statusRaw
        : undefined;
    const items = listRemediationQueue(db, {
      status,
      conceptSlug: str(req.query.conceptSlug),
      limit: intParam(req.query.limit, 25),
    });
    res.json({ items, count: items.length });
  });

  router.post('/recommend', (req, res) => {
    const body = parse(
      z.object({
        severityMin: z.number().min(0).max(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
        roadmapId: z.string().optional(),
      }),
      req.body ?? {},
    );
    res.status(201).json(recommendRemediationForWeaknesses(db, body));
  });

  router.patch('/:id', (req, res) => {
    const body = parse(
      z.object({
        status: z.enum(['open', 'generated', 'dismissed', 'resolved']),
        generatedLessonId: z.string().optional(),
      }),
      req.body,
    );
    const item = updateRemediationStatus(db, {
      id: req.params.id,
      status: body.status,
      generatedLessonId: body.generatedLessonId,
    });
    if (!item) throw notFound(`Remediation item "${req.params.id}" not found.`);
    res.json({ item });
  });

  return router;
}
