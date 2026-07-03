import { CardRef, QuizCard, SubjectId, TrueFalseCard, FillBlankCard } from '@/types/content';
import { allLessons } from '@/data/courses';
import { makeItemId } from '@/srs/scheduler';
import { mulberry32, seedFromString, shuffle } from '@/utils/random';

export interface ChallengeRef extends CardRef {
  card: QuizCard | TrueFalseCard | FillBlankCard;
  subjectTitle: string;
  accent: string;
}

export const DAILY_CHALLENGE_SIZE = 7;

/** All quiz/true-false cards across the built-in catalogue, as challenge refs. */
function questionPool(): ChallengeRef[] {
  const pool: ChallengeRef[] = [];
  for (const { subject, lesson } of allLessons()) {
    lesson.cards.forEach((card, cardIndex) => {
      if (card.type === 'quiz' || card.type === 'truefalse' || card.type === 'fillblank') {
        pool.push({
          id: makeItemId(lesson.id, cardIndex),
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          subjectId: subject.id,
          subjectTitle: subject.title,
          accent: subject.accent,
          cardIndex,
          card,
        });
      }
    });
  }
  return pool;
}

/**
 * A stable, date-seeded set of mixed questions. The same `dayKey` always yields
 * the same challenge, so reopening it mid-session is safe; it rolls over daily.
 */
export function buildDailyChallenge(
  dayKey: string,
  size: number = DAILY_CHALLENGE_SIZE,
): ChallengeRef[] {
  const pool = questionPool();
  const rnd = mulberry32(seedFromString(`challenge:${dayKey}`));
  // Spread picks across subjects when possible by interleaving shuffled groups.
  const bySubject = new Map<SubjectId, ChallengeRef[]>();
  for (const ref of shuffle(pool, rnd)) {
    const list = bySubject.get(ref.subjectId) ?? [];
    list.push(ref);
    bySubject.set(ref.subjectId, list);
  }
  const groups = [...bySubject.values()];
  const picked: ChallengeRef[] = [];
  let i = 0;
  while (picked.length < size && groups.some((g) => g.length > 0)) {
    const g = groups[i % groups.length];
    const next = g.shift();
    if (next) picked.push(next);
    i++;
  }
  return picked.slice(0, size);
}
