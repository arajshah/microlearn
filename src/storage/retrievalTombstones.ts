import AsyncStorage from '@react-native-async-storage/async-storage';

const REVIEW_SETS_KEY = 'microlearn.deleted.reviewSets.v1';
const ITEMS_KEY = 'microlearn.deleted.retrievalItems.v1';

async function readIds(key: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

async function writeIds(key: string, ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify([...ids]));
}

export async function readDeletedReviewSetIds(): Promise<Set<string>> {
  return readIds(REVIEW_SETS_KEY);
}

export async function readDeletedRetrievalItemIds(): Promise<Set<string>> {
  return readIds(ITEMS_KEY);
}

export async function tombstoneReviewSet(reviewSetId: string): Promise<void> {
  const ids = await readDeletedReviewSetIds();
  ids.add(reviewSetId);
  await writeIds(REVIEW_SETS_KEY, ids);
}

export async function tombstoneRetrievalItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const ids = await readDeletedRetrievalItemIds();
  for (const id of itemIds) ids.add(id);
  await writeIds(ITEMS_KEY, ids);
}

export function filterRetrievalItems<T extends { id: string; reviewSetId?: string }>(
  items: T[],
  deletedReviewSets: Set<string>,
  deletedItems: Set<string>,
): T[] {
  return items.filter(
    (item) =>
      !deletedItems.has(item.id) &&
      !(item.reviewSetId && deletedReviewSets.has(item.reviewSetId)),
  );
}
