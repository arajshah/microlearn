import type { RetrievalRating, RetrievalItemStatus, ScheduleState } from './retrievalTypes';

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function isDue(dueAt: string, now = new Date()): boolean {
  return new Date(dueAt).getTime() <= now.getTime();
}

export function initialSchedule(now = new Date(), dueTomorrow = false): ScheduleState {
  return {
    reps: 0,
    lapses: 0,
    ease: 2.5,
    intervalDays: 0,
    dueAt: (dueTomorrow ? addDays(now, 1) : now).toISOString(),
    lastReviewedAt: null,
    status: 'active',
  };
}

/** Apply SM-2-style rating update to schedule state. */
export function applyRating(
  state: Pick<ScheduleState, 'reps' | 'lapses' | 'ease' | 'intervalDays' | 'status'>,
  rating: RetrievalRating,
  now = new Date(),
): ScheduleState {
  let reps = state.reps;
  let lapses = state.lapses;
  let ease = state.ease;
  let intervalDays = state.intervalDays;
  let status: RetrievalItemStatus = 'active';

  switch (rating) {
    case 'forgot':
      reps = 0;
      lapses += 1;
      ease = Math.max(1.3, ease - 0.2);
      intervalDays = 0;
      break;
    case 'partial':
      reps += 1;
      ease = Math.max(1.3, ease - 0.05);
      intervalDays = Math.max(1, intervalDays || 1);
      break;
    case 'remembered':
      reps += 1;
      ease = Math.min(2.8, ease + 0.05);
      if (reps === 1) intervalDays = 1;
      else if (reps === 2) intervalDays = 3;
      else intervalDays = Math.max(1, Math.round(intervalDays * ease));
      break;
    case 'easy':
      reps += 1;
      ease = Math.min(3.0, ease + 0.1);
      if (reps === 1) intervalDays = 3;
      else if (reps === 2) intervalDays = 7;
      else intervalDays = Math.max(1, Math.round(intervalDays * ease));
      break;
  }

  const dueAt =
    rating === 'forgot'
      ? addDays(now, 1).toISOString()
      : addDays(now, Math.max(1, intervalDays)).toISOString();

  if (intervalDays >= 21 && reps >= 4) {
    status = 'mastered';
  }

  return {
    reps,
    lapses,
    ease,
    intervalDays,
    dueAt,
    lastReviewedAt: now.toISOString(),
    status,
  };
}

export function ratingToCorrect(rating: RetrievalRating): boolean | undefined {
  if (rating === 'remembered' || rating === 'easy') return true;
  if (rating === 'forgot') return false;
  return undefined;
}
