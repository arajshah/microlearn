import type { Db } from '../db';

function loadNodeId(db: Db, roadmapId: string, nodeId: string): string | null {
  const row = db
    .prepare('SELECT id FROM lesson_nodes WHERE id = ? AND roadmap_id = ?')
    .get(nodeId, roadmapId) as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * Resolves a roadmap node id to the canonical persisted id within one roadmap.
 * Accepts exact matches and unambiguous scoped/unscoped aliases only.
 */
export function resolveRoadmapNodeId(
  db: Db,
  roadmapId: string,
  requestedId: string,
): string | null {
  const trimmed = requestedId.trim();
  if (!trimmed) return null;

  const exact = loadNodeId(db, roadmapId, trimmed);
  if (exact) return exact;

  const prefix = `${roadmapId}-`;
  const alternates: string[] = [];
  if (trimmed.startsWith(prefix)) {
    alternates.push(trimmed.slice(prefix.length));
  } else {
    alternates.push(`${prefix}${trimmed}`);
  }

  const matches = alternates
    .map((candidate) => loadNodeId(db, roadmapId, candidate))
    .filter((id): id is string => Boolean(id));

  if (matches.length === 1) return matches[0];
  return null;
}
