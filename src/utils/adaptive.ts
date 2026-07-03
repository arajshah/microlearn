import { MasteryLevel } from '@/data/mastery';

/**
 * Recommend a mastery level from the learner's self-reported level, nudged by
 * how much of the subject they've already mastered (progress 0..1).
 */
export function suggestedMasteryLevel(
  level: MasteryLevel,
  subjectProgress: number,
): MasteryLevel {
  let next = level;
  if (subjectProgress >= 0.65 && next < 5) next = (next + 1) as MasteryLevel;
  else if (subjectProgress <= 0.12 && next > 1) next = (next - 1) as MasteryLevel;
  return next;
}
