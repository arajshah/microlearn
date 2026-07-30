import {
  deleteRetrievalItem,
  deleteReviewSet,
  isServerConfigured,
} from '@/services/microlearnServer';
import { enqueuePendingMutation } from '@/storage/pendingMutations';
import { tombstoneRetrievalItems, tombstoneReviewSet } from '@/storage/retrievalTombstones';

export async function removeReviewGroup(input: {
  reviewSetId?: string;
  itemIds: string[];
}): Promise<void> {
  if (input.reviewSetId) {
    await tombstoneReviewSet(input.reviewSetId);
    if (isServerConfigured()) {
      const result = await deleteReviewSet(input.reviewSetId);
      if (!result.ok) {
        await enqueuePendingMutation('delete_review_set', { reviewSetId: input.reviewSetId });
      }
    }
    return;
  }

  await tombstoneRetrievalItems(input.itemIds);
  if (!isServerConfigured()) return;

  for (const itemId of input.itemIds) {
    const result = await deleteRetrievalItem(itemId);
    if (!result.ok) {
      await enqueuePendingMutation('delete_retrieval_item', { itemId });
    }
  }
}
