import type { ServerRetrievalItem, ServerRetrievalSession } from '@/services/microlearnServer';

let cache: {
  sessionId: string;
  session: ServerRetrievalSession;
  items: ServerRetrievalItem[];
} | null = null;

export function setRetrievalSessionCache(payload: {
  sessionId: string;
  session: ServerRetrievalSession;
  items: ServerRetrievalItem[];
}): void {
  cache = payload;
}

export function consumeRetrievalSessionCache(sessionId: string): {
  session: ServerRetrievalSession;
  items: ServerRetrievalItem[];
} | null {
  if (!cache || cache.sessionId !== sessionId) return null;
  const data = { session: cache.session, items: cache.items };
  cache = null;
  return data;
}
