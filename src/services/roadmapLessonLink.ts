/** Avoids circular imports between LibraryContext and RoadmapContext. */
type UnlinkHandler = (roadmapId: string, nodeId: string) => Promise<void>;

let unlinkHandler: UnlinkHandler | null = null;

export function registerRoadmapLessonUnlinkHandler(handler: UnlinkHandler | null): void {
  unlinkHandler = handler;
}

export async function unlinkRoadmapNodeAfterLessonDelete(
  roadmapId: string,
  nodeId: string,
): Promise<void> {
  if (!unlinkHandler) return;
  await unlinkHandler(roadmapId, nodeId);
}
