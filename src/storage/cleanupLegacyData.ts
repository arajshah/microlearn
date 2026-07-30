import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeneratedRoadmap } from '@/types/roadmap';
import { isServerConfigured } from '@/services/microlearnServer';
import { cleanupDemoRetrievalOnServer } from '@/services/microlearnServer';

const CLEANUP_FLAG = 'microlearn.legacyCleanup.v2';

const LOCAL_REVIEW_KEYS = [
  'microlearn.review.v1',
  'microlearn.retrieval.v1',
  'microlearn.reviews.v1',
];

export const DEMO_CONTENT_PATTERNS: RegExp[] = [
  /smoke\s*test/i,
  /placeholder/i,
  /\bdummy\b/i,
  /\bdemo\b/i,
  /audit\s*test/i,
  /graphs\s*101/i,
  /intro\s*to\s*graphs/i,
  /microlearn\s*mcp/i,
  /\bsample\b/i,
];

export function isDemoContent(title: string, topic?: string): boolean {
  const haystack = `${title} ${topic ?? ''}`.trim();
  if (!haystack) return false;
  return DEMO_CONTENT_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function filterDemoRoadmaps(roadmaps: GeneratedRoadmap[]): GeneratedRoadmap[] {
  return roadmaps.filter((rm) => !isDemoContent(rm.title, rm.topic));
}

/** One-time idempotent cleanup of local dummy review data and demo cache entries. */
export async function runLegacyDataCleanup(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(CLEANUP_FLAG);
    if (done === 'done') return;

    for (const key of LOCAL_REVIEW_KEYS) {
      await AsyncStorage.removeItem(key).catch(() => {});
    }

    const roadmapsRaw = await AsyncStorage.getItem('microlearn.cache.roadmaps.v1');
    if (roadmapsRaw) {
      try {
        const parsed = JSON.parse(roadmapsRaw) as {
          roadmaps?: GeneratedRoadmap[];
          deletedIds?: string[];
          updatedAt?: string;
        };
        if (parsed.roadmaps && Array.isArray(parsed.roadmaps)) {
          const demoIds = parsed.roadmaps
            .filter((rm) => isDemoContent(rm.title, rm.topic))
            .map((rm) => rm.id);
          const kept = parsed.roadmaps.filter((rm) => !demoIds.includes(rm.id));
          const deletedIds = [...new Set([...(parsed.deletedIds ?? []), ...demoIds])];
          await AsyncStorage.setItem(
            'microlearn.cache.roadmaps.v1',
            JSON.stringify({
              ...parsed,
              roadmaps: kept,
              deletedIds,
              updatedAt: new Date().toISOString(),
            }),
          );
        }
      } catch {
        /* skip corrupt cache */
      }
    }

    if (isServerConfigured()) {
      await cleanupDemoRetrievalOnServer().catch(() => {});
    }

    await AsyncStorage.setItem(CLEANUP_FLAG, 'done');
  } catch {
    /* non-fatal */
  }
}
