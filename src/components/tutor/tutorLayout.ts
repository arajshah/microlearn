/**
 * Pure snap-point and clamping helpers for the resizable tutor sheet.
 * Kept free of React Native so verification scripts can import them.
 */

export type TutorSnapId = 'compact' | 'expanded' | 'full';

export const TUTOR_SNAP_RATIOS: Record<TutorSnapId, number> = {
  compact: 0.38,
  expanded: 0.68,
  full: 1,
};

/** Minimum sheet height so composer + a short reply remain usable on small phones. */
export const TUTOR_MIN_SHEET_HEIGHT = 220;

/** Extra headroom reserved above the sheet for lesson peek / safe controls. */
export const TUTOR_TOP_PEEK = 12;

export function computeUsableHeight(
  windowHeight: number,
  topInset: number,
  topPeek: number = TUTOR_TOP_PEEK,
): number {
  return Math.max(TUTOR_MIN_SHEET_HEIGHT, Math.round(windowHeight - topInset - topPeek));
}

export function computeSnapHeights(usableHeight: number): Record<TutorSnapId, number> {
  const full = Math.max(TUTOR_MIN_SHEET_HEIGHT, Math.round(usableHeight));
  return {
    compact: Math.max(TUTOR_MIN_SHEET_HEIGHT, Math.round(usableHeight * TUTOR_SNAP_RATIOS.compact)),
    expanded: Math.max(TUTOR_MIN_SHEET_HEIGHT, Math.round(usableHeight * TUTOR_SNAP_RATIOS.expanded)),
    full,
  };
}

export function clampSheetHeight(height: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, height));
}

export function nearestSnap(height: number, snaps: Record<TutorSnapId, number>): TutorSnapId {
  const order: TutorSnapId[] = ['compact', 'expanded', 'full'];
  let best: TutorSnapId = 'compact';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const id of order) {
    const dist = Math.abs(snaps[id] - height);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}

/**
 * When the keyboard opens from compact, bump to expanded so the conversation
 * area stays useful. Higher snaps stay put.
 */
export function snapForKeyboardOpen(current: TutorSnapId): TutorSnapId {
  return current === 'compact' ? 'expanded' : current;
}

/**
 * Height available for the sheet once the keyboard frame occupies the bottom.
 * On platforms that already resize the window, pass keyboardHeight = 0.
 */
export function usableHeightAboveKeyboard(
  windowHeight: number,
  topInset: number,
  keyboardHeight: number,
  topPeek: number = TUTOR_TOP_PEEK,
): number {
  const usable = computeUsableHeight(windowHeight, topInset, topPeek);
  if (keyboardHeight <= 0) return usable;
  return Math.max(TUTOR_MIN_SHEET_HEIGHT, usable - Math.round(keyboardHeight));
}

export function resolveSheetHeight(options: {
  snap: TutorSnapId;
  snaps: Record<TutorSnapId, number>;
  maxAvailable: number;
  keyboardVisible: boolean;
}): { snap: TutorSnapId; height: number } {
  const snap = options.keyboardVisible ? snapForKeyboardOpen(options.snap) : options.snap;
  const desired = options.snaps[snap];
  const height = clampSheetHeight(desired, TUTOR_MIN_SHEET_HEIGHT, options.maxAvailable);
  return { snap, height };
}

export function nextSnap(current: TutorSnapId, direction: 'expand' | 'collapse'): TutorSnapId {
  const order: TutorSnapId[] = ['compact', 'expanded', 'full'];
  const idx = order.indexOf(current);
  if (direction === 'expand') return order[Math.min(order.length - 1, idx + 1)] ?? 'full';
  return order[Math.max(0, idx - 1)] ?? 'compact';
}
