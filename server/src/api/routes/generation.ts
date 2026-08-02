import { Router } from 'express';
import type { Db } from '../../db';
import { parse } from '../http';
import {
  generateNodeLessonBodySchema,
  generateLessonBodySchema,
  generateRoadmapBodySchema,
  pregenerateRoadmapBodySchema,
} from '../validators';
import {
  generateRoadmap,
  generateRoadmapNodeLesson,
  generateStandaloneLesson,
  pregenerateRoadmapLessons,
  tutorReply,
} from '../../generation/generationService';
import { getRoadmap } from '../repository';
import { tutorReplyBodySchema } from '../validators';

/** Server-side AI generation routes mounted at /api/generation. */
export function createGenerationRouter(db: Db): Router {
  const router = Router();

  router.post('/roadmaps', async (req, res, next) => {
    try {
      const body = parse(generateRoadmapBodySchema, req.body);
      const roadmap = await generateRoadmap(db, body);
      res.status(201).json({ roadmap });
    } catch (err) {
      next(err);
    }
  });

  router.post('/lessons', async (req, res, next) => {
    try {
      const body = parse(generateLessonBodySchema, req.body);
      const lesson = await generateStandaloneLesson(db, body);
      res.status(201).json({ lesson });
    } catch (err) {
      next(err);
    }
  });

  router.post('/roadmaps/:roadmapId/nodes/:nodeId/generate', async (req, res, next) => {
    try {
      const body = parse(generateNodeLessonBodySchema, req.body ?? {});
      const result = await generateRoadmapNodeLesson(db, {
        roadmapId: req.params.roadmapId,
        nodeId: req.params.nodeId,
        subjectId: body.subjectId,
        idempotencyKey: body.idempotencyKey,
      });
      res.status(result.reused ? 200 : 201).json({
        lesson: result.lesson,
        reused: result.reused,
        roadmap: getRoadmap(db, req.params.roadmapId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/roadmaps/:roadmapId/pregenerate', async (req, res, next) => {
    try {
      const body = parse(pregenerateRoadmapBodySchema, req.body ?? {});
      const result = await pregenerateRoadmapLessons(db, {
        roadmapId: req.params.roadmapId,
        fromNodeId: body.fromNodeId,
        count: body.count,
      });
      res.json({
        ...result,
        roadmap: getRoadmap(db, req.params.roadmapId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tutor', async (req, res, next) => {
    try {
      const body = parse(tutorReplyBodySchema, req.body);
      const reply = await tutorReply(db, body);
      res.json({ reply });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
