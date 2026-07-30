import {
  ServerRetrievalItem,
  ServerRetrievalScheduleItem,
} from '@/services/microlearnServer';

export type ScheduledItem = ServerRetrievalItem | ServerRetrievalScheduleItem;

export type ReviewGroup = {
  id: string;
  reviewSetId?: string;
  title: string;
  sourceLabel: string;
  dueAt: string;
  items: ScheduledItem[];
};

function itemLabel(item: ScheduledItem): string {
  if (item.roadmapId) return 'Roadmap';
  return 'Lesson';
}

function itemTitle(item: ScheduledItem): string {
  return item.reviewSetTitle?.trim() || item.concept?.trim() || 'Lesson review';
}

/** Group retrieval items by review set / lesson for display and counts. */
export function groupReviewItems(items: ScheduledItem[]): ReviewGroup[] {
  const map = new Map<string, ReviewGroup>();
  for (const item of items) {
    const id = item.reviewSetId ?? item.lessonId ?? item.id;
    const existing = map.get(id);
    if (existing) {
      existing.items.push(item);
      if (new Date(item.dueAt).getTime() < new Date(existing.dueAt).getTime()) {
        existing.dueAt = item.dueAt;
      }
      continue;
    }
    map.set(id, {
      id,
      reviewSetId: item.reviewSetId,
      title: itemTitle(item),
      sourceLabel: itemLabel(item),
      dueAt: item.dueAt,
      items: [item],
    });
  }
  return [...map.values()].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function countDueReviewGroups(items: ScheduledItem[]): number {
  return groupReviewItems(items).length;
}
