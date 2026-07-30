import { Router } from 'express';
import type { Db } from '../../db';
import { parse } from '../http';
import {
  getGeneratedLesson,
  listGeneratedLessons,
  patchGeneratedLesson,
  softDeleteGeneratedLesson,
  upsertGeneratedLesson,
} from '../repository';
import { lessonPatchSchema, lessonUpsertSchema } from '../validators';

function asyncRoute(
  handler: (req: import('express').Request, res: import('express').Response) => unknown,
) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    try {
      const result = handler(req, res);
      if (result instanceof Promise) {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

/** Generated-lesson routes mounted at /api/lessons. */
export function createLessonsRouter(db: Db): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ lessons: listGeneratedLessons(db) });
  });

  router.post(
    '/',
    asyncRoute((req, res) => {
      const input = parse(lessonUpsertSchema, req.body);
      res.status(201).json({ lesson: upsertGeneratedLesson(db, input) });
    }),
  );

  router.get('/:lessonId', asyncRoute((req, res) => {
    const lessonId = String(req.params.lessonId);
    res.json({ lesson: getGeneratedLesson(db, lessonId) });
  }));

  router.patch('/:lessonId', asyncRoute((req, res) => {
    const lessonId = String(req.params.lessonId);
    const patch = parse(lessonPatchSchema, req.body);
    res.json({ lesson: patchGeneratedLesson(db, lessonId, patch) });
  }));

  router.delete('/:lessonId', asyncRoute((req, res) => {
    const lessonId = String(req.params.lessonId);
    res.json({ lesson: softDeleteGeneratedLesson(db, lessonId) });
  }));

  return router;
}
