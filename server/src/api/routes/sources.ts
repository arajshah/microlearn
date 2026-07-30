import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import type { Db } from '../../db';
import { parse } from '../http';
import { ApiError } from '../apiError';
import {
  createUploadedSourceDocument,
  extractDocumentSource,
  getSerializedSource,
  listSourceDocuments,
} from '../../sources/sourceRepository';
import type { SerializedSourceDocument } from '../../sources/sourceSerialization';
import { MAX_UPLOAD_BYTES, SourceExtractionError } from '../../sources/sourceTypes';
import { readMultipartUploadFile } from '../../sources/uploadParser';

const extractSchema = z.object({
  url: z.string().min(1),
  force: z.boolean().optional(),
});

const listSchema = z.object({
  status: z.enum(['pending', 'extracting', 'ready', 'failed']).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

type UploadSourceResponse = SerializedSourceDocument & {
  filename?: string;
  sizeBytes?: number;
  extractedTextPreview?: string;
};

function withUploadFields(source: SerializedSourceDocument): UploadSourceResponse {
  const metadata = source.metadata ?? {};
  const filename = typeof metadata.filename === 'string' ? metadata.filename : undefined;
  const sizeBytes = typeof metadata.sizeBytes === 'number' ? metadata.sizeBytes : undefined;
  return {
    ...source,
    filename,
    sizeBytes,
    extractedTextPreview: source.summary?.preview,
  };
}

/** Source document routes mounted at /api/sources. */
export function createSourcesRouter(db: Db): Router {
  const router = Router();

  router.post('/extract', async (req, res, next) => {
    try {
      const input = parse(extractSchema, req.body);
      const source = await extractDocumentSource(db, { url: input.url, force: input.force, actor: 'api' });
      res.status(source.status === 'ready' ? 200 : 422).json({ source });
    } catch (err) {
      if (err instanceof SourceExtractionError) {
        next(new ApiError(400, err.message, err.code));
        return;
      }
      if (err instanceof ApiError) {
        next(err);
        return;
      }
      next(err);
    }
  });

  router.post('/upload', async (req, res, next) => {
    try {
      const file = await readMultipartUploadFile(req, MAX_UPLOAD_BYTES);
      const source = await createUploadedSourceDocument(db, {
        file,
        uploadRoot: path.resolve(process.cwd(), 'server/uploads/sources'),
        actor: 'api',
      });
      res.status(source.status === 'ready' ? 200 : 422).json({ source: withUploadFields(source) });
    } catch (err) {
      if (err instanceof SourceExtractionError) {
        next(new ApiError(err.code === 'UPLOAD_TOO_LARGE' ? 413 : 400, err.message, err.code));
        return;
      }
      next(err);
    }
  });

  router.get('/', (req, res, next) => {
    try {
      const query = parse(listSchema, req.query);
      const rows = listSourceDocuments(db, { status: query.status, limit: query.limit });
      res.json({
        sources: rows.map((row) => getSerializedSource(db, row.id, false)),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:sourceId', (req, res, next) => {
    try {
      const includeText = req.query.includeText === 'true';
      const source = getSerializedSource(db, req.params.sourceId, includeText);
      res.json({ source });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
