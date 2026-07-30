import type { Response } from 'express';
import { z } from 'zod';
import { ApiError, badRequest } from './apiError';
import { logger } from '../logger';

/** Parses input with a zod schema, throwing a 400 ApiError on failure. */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw badRequest(`Validation failed: ${detail}`);
  }
  return result.data;
}

/** Sends a structured, stack-free JSON error response. */
export function sendError(res: Response, err: unknown): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code ?? 'ERROR', message: err.message } });
    return;
  }
  logger.error('API handler error', err instanceof Error ? err.message : 'unknown');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error.' } });
}
