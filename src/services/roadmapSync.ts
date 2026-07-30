import { GeneratedRoadmap } from '@/types/roadmap';
import { allRoadmapLessons } from '@/utils/roadmapProgress';
import {
  createServerRoadmap,
  fetchServerRoadmap,
  fetchServerRoadmapMeta,
  isServerConfigured,
} from '@/services/microlearnServer';

export interface RoadmapSyncResult {
  ok: boolean;
  roadmap?: GeneratedRoadmap;
  errorMessage?: string;
  syncedNow?: boolean;
}

/** Prefer local node progress (generatedLessonId, status) over server snapshot. */
export function mergeRoadmapLocalProgress(
  local: GeneratedRoadmap,
  server: GeneratedRoadmap,
): GeneratedRoadmap {
  const localNodes = new Map(allRoadmapLessons(local).map((n) => [n.id, n]));
  return {
    ...server,
    ...local,
    units: local.units.map((unit) => ({
      ...unit,
      lessons: unit.lessons.map((node) => {
        const localNode = localNodes.get(node.id);
        if (!localNode) return node;
        return {
          ...node,
          status: localNode.status,
          generatedLessonId: localNode.generatedLessonId ?? node.generatedLessonId,
          blueprintId: localNode.blueprintId ?? node.blueprintId,
          blueprintVersion: localNode.blueprintVersion ?? node.blueprintVersion,
        };
      }),
    })),
  };
}

/**
 * Ensures a roadmap exists on the backend before saving roadmap-linked lessons.
 * Idempotent: returns existing server roadmap when already present.
 */
export async function ensureRoadmapSynced(
  roadmap: GeneratedRoadmap,
): Promise<RoadmapSyncResult> {
  if (!isServerConfigured()) {
    return { ok: true, roadmap };
  }

  const meta = await fetchServerRoadmapMeta(roadmap.id);
  if (meta === 'deleted') {
    return {
      ok: false,
      errorMessage: 'This roadmap was deleted on the server. Create a new roadmap to continue.',
    };
  }

  if (meta === 'active') {
    const server = await fetchServerRoadmap(roadmap.id);
    if (server) {
      return { ok: true, roadmap: mergeRoadmapLocalProgress(roadmap, server) };
    }
  }

  console.warn('[roadmap-sync] creating roadmap on backend', roadmap.id, roadmap.title);
  const result = await createServerRoadmap(roadmap);
  if (!result.ok) {
    console.warn('[roadmap-sync] create failed', roadmap.id, result.errorMessage);
    return {
      ok: false,
      errorMessage: result.errorMessage ?? 'Failed to sync roadmap to backend.',
    };
  }

  const merged = result.data
    ? mergeRoadmapLocalProgress(roadmap, result.data)
    : roadmap;
  return { ok: true, roadmap: merged, syncedNow: true };
}

export async function isRoadmapOnBackend(roadmapId: string): Promise<boolean> {
  if (!isServerConfigured()) return false;
  const meta = await fetchServerRoadmapMeta(roadmapId);
  return meta === 'active';
}
