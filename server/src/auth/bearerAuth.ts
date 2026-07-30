import type { NextFunction, Request, Response } from 'express';

/** Parses `Authorization: Bearer <token>`; returns null when absent or malformed. */
export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/** Express middleware that requires a matching bearer token. */
export function requireBearerToken(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = parseBearerToken(req.headers.authorization);
    if (!token || token !== expectedToken) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid bearer token.' } });
      return;
    }
    next();
  };
}
