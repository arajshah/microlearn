import { GeneratedRoadmap, RoadmapLessonNode, RoadmapUnit } from '@/types/roadmap';
import { allRoadmapLessons } from '@/utils/roadmapProgress';

function cleanSegment(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function makeScopedId(
  roadmapId: string,
  rawId: string,
  fallback: string,
  used: Set<string>,
): string {
  const prefix = `${roadmapId}-`;
  const base = rawId.startsWith(prefix)
    ? cleanSegment(rawId, `${prefix}${fallback}`)
    : `${prefix}${cleanSegment(rawId, fallback)}`;

  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/** True when a roadmap came from the backend and must keep server-canonical ids. */
export function isServerOriginatedRoadmap(roadmap: GeneratedRoadmap): boolean {
  return Boolean(roadmap.serverSummary);
}

function hasLegacyLocalEntityIds(roadmap: GeneratedRoadmap): boolean {
  const legacyPattern = /^(u|l)\d+$/i;
  for (const unit of roadmap.units) {
    if (legacyPattern.test(unit.id)) return true;
    for (const node of unit.lessons) {
      if (legacyPattern.test(node.id)) return true;
    }
  }
  return false;
}

/**
 * Resolves a requested node id to the roadmap's canonical node id.
 * Accepts exact matches and unambiguous scoped/unscoped aliases only.
 */
export function resolveRoadmapNodeId(
  roadmap: GeneratedRoadmap,
  requestedId: string,
): string | null {
  const trimmed = requestedId.trim();
  if (!trimmed) return null;

  const nodes = allRoadmapLessons(roadmap);
  if (nodes.some((node) => node.id === trimmed)) return trimmed;

  const prefix = `${roadmap.id}-`;
  const alternates: string[] = [];
  if (trimmed.startsWith(prefix)) {
    alternates.push(trimmed.slice(prefix.length));
  } else {
    alternates.push(`${prefix}${trimmed}`);
  }

  const matches = alternates.filter((candidate) => nodes.some((node) => node.id === candidate));
  if (matches.length === 1) return matches[0];
  return null;
}

/** Builds alias keys (scoped + unscoped) for matching stale cached node ids. */
export function buildRoadmapNodeAliasMap(
  roadmap: GeneratedRoadmap,
): Map<string, RoadmapLessonNode> {
  const map = new Map<string, RoadmapLessonNode>();
  const prefix = `${roadmap.id}-`;
  for (const node of allRoadmapLessons(roadmap)) {
    map.set(node.id, node);
    if (node.id.startsWith(prefix)) {
      map.set(node.id.slice(prefix.length), node);
    } else {
      map.set(`${prefix}${node.id}`, node);
    }
  }
  return map;
}

function findLocalNodeForCanonicalId(
  local: GeneratedRoadmap,
  canonicalNodeId: string,
): RoadmapLessonNode | undefined {
  const aliasMap = buildRoadmapNodeAliasMap(local);
  return aliasMap.get(canonicalNodeId);
}

/**
 * Repairs a stale cached roadmap using the server roadmap as canonical authority.
 * Preserves local completion/generation evidence without duplicating units or lessons.
 */
export function repairStaleRoadmapFromServer(
  local: GeneratedRoadmap,
  server: GeneratedRoadmap,
): GeneratedRoadmap {
  const units: RoadmapUnit[] = server.units.map((unit) => ({
    ...unit,
    lessons: unit.lessons.map((remoteNode) => {
      const localNode = findLocalNodeForCanonicalId(local, remoteNode.id);
      if (!localNode) return remoteNode;

      const nextNode = { ...remoteNode };
      if (localNode.status === 'completed' && remoteNode.status !== 'completed') {
        nextNode.status = 'completed';
      }
      if (!nextNode.generatedLessonId && localNode.generatedLessonId) {
        nextNode.generatedLessonId = localNode.generatedLessonId;
        nextNode.blueprintId = localNode.blueprintId;
        nextNode.blueprintVersion = localNode.blueprintVersion;
      }
      return nextNode;
    }),
  }));

  return {
    ...server,
    targetLessonCount: local.targetLessonCount ?? server.targetLessonCount,
    slidesPerLesson: local.slidesPerLesson ?? server.slidesPerLesson,
    preferences: local.preferences ?? server.preferences,
    sourceUrl: local.sourceUrl ?? server.sourceUrl,
    sourceExtractionId: local.sourceExtractionId ?? server.sourceExtractionId,
    sourceContext: local.sourceContext ?? server.sourceContext,
    units,
  };
}

/**
 * Scope legacy local ids (u1/l1) before a roadmap's first server sync.
 * Never rewrite ids on server-originated roadmaps.
 */
export function normalizeLocalRoadmapEntityIds(roadmap: GeneratedRoadmap): GeneratedRoadmap {
  if (isServerOriginatedRoadmap(roadmap)) return roadmap;
  if (!hasLegacyLocalEntityIds(roadmap)) return roadmap;

  const usedUnitIds = new Set<string>();
  const usedNodeIds = new Set<string>();
  const unitIdByOld = new Map<string, string>();
  const nodeIdByOld = new Map<string, string>();

  roadmap.units.forEach((unit, unitIndex) => {
    unitIdByOld.set(
      unit.id,
      makeScopedId(roadmap.id, unit.id, `u${unitIndex + 1}`, usedUnitIds),
    );
  });

  let globalNodeIndex = 0;
  roadmap.units.forEach((unit) => {
    unit.lessons.forEach((node) => {
      globalNodeIndex += 1;
      const nextNodeId = makeScopedId(
        roadmap.id,
        node.id,
        `l${globalNodeIndex}`,
        usedNodeIds,
      );
      if (!nodeIdByOld.has(node.id)) nodeIdByOld.set(node.id, nextNodeId);
    });
  });

  const units: RoadmapUnit[] = roadmap.units.map((unit) => {
    const unitId = unitIdByOld.get(unit.id) ?? unit.id;
    const lessons: RoadmapLessonNode[] = unit.lessons.map((node) => ({
      ...node,
      id: nodeIdByOld.get(node.id) ?? node.id,
      unitId,
      prerequisiteIds: node.prerequisiteIds.map((id) => nodeIdByOld.get(id) ?? id),
    }));
    return { ...unit, id: unitId, lessons };
  });

  return { ...roadmap, units };
}

/** @deprecated Use normalizeLocalRoadmapEntityIds for unsynced local roadmaps only. */
export function normalizeRoadmapEntityIds(roadmap: GeneratedRoadmap): GeneratedRoadmap {
  return normalizeLocalRoadmapEntityIds(roadmap);
}

export function normalizeRoadmapEntityIdsList(roadmaps: GeneratedRoadmap[]): GeneratedRoadmap[] {
  return roadmaps.map(normalizeLocalRoadmapEntityIds);
}

/** Repairs stale node references inside a roadmap before sync or completion. */
export function canonicalizeRoadmapNodeReferences(roadmap: GeneratedRoadmap): GeneratedRoadmap {
  const units = roadmap.units.map((unit) => ({
    ...unit,
    lessons: unit.lessons.map((node) => ({
      ...node,
      prerequisiteIds: node.prerequisiteIds.map(
        (id) => resolveRoadmapNodeId(roadmap, id) ?? id,
      ),
    })),
  }));
  return { ...roadmap, units };
}

/** Repairs pending mutation payloads that still carry stale scoped node ids. */
export function repairRoadmapMutationPayload(roadmap: GeneratedRoadmap): GeneratedRoadmap {
  const canonical = canonicalizeRoadmapNodeReferences(roadmap);
  if (isServerOriginatedRoadmap(canonical)) return canonical;
  return normalizeLocalRoadmapEntityIds(canonical);
}
