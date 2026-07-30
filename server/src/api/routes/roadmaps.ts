import { Router } from 'express';
import type { Db } from '../../db';
import { parse } from '../http';
import {
  createRoadmap,
  getRoadmap,
  listRoadmaps,
  listRoadmapLessons,
  patchLessonNode,
  patchRoadmap,
  softDeleteRoadmap,
} from '../repository';
import { listRoadmapOutcomes } from '../../outcomes/outcomeRepository';
import {
  deleteRoadmapSchema,
  roadmapCreateSchema,
  roadmapListQuerySchema,
  roadmapNodePatchSchema,
  roadmapPatchSchema,
} from '../validators';

/** Roadmap CRUD routes mounted at /api/roadmaps. */
export function createRoadmapsRouter(db: Db): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const { status } = parse(roadmapListQuerySchema, req.query);
      res.json({ roadmaps: listRoadmaps(db, status) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const input = parse(roadmapCreateSchema, req.body);
      res.status(201).json({ roadmap: createRoadmap(db, input) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:roadmapId', (req, res, next) => {
    try {
      res.json({ roadmap: getRoadmap(db, req.params.roadmapId) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:roadmapId', (req, res, next) => {
    try {
      const patch = parse(roadmapPatchSchema, req.body);
      res.json({ roadmap: patchRoadmap(db, req.params.roadmapId, patch) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:roadmapId', (req, res, next) => {
    try {
      parse(deleteRoadmapSchema, req.body);
      res.json({ roadmap: softDeleteRoadmap(db, req.params.roadmapId) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:roadmapId/nodes/:nodeId', (req, res, next) => {
    try {
      const patch = parse(roadmapNodePatchSchema, req.body);
      res.json({
        roadmap: patchLessonNode(db, req.params.roadmapId, req.params.nodeId, patch),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:roadmapId/lessons', (req, res, next) => {
    try {
      res.json({ lessons: listRoadmapLessons(db, req.params.roadmapId) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:roadmapId/outcomes', (req, res, next) => {
    try {
      res.json({ outcomes: listRoadmapOutcomes(db, req.params.roadmapId) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
