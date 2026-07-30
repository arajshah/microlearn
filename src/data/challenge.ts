import { CardRef, QuizCard, SubjectId, TrueFalseCard, FillBlankCard } from '@/types/content';
import { GeneratedLesson } from '@/types/content';
import { getSubject } from '@/data/subjects';
import { makeItemId } from '@/srs/scheduler';
import { mulberry32, seedFromString, shuffle } from '@/utils/random';

export interface ChallengeRef extends CardRef {
  card: QuizCard | TrueFalseCard | FillBlankCard;
  subjectTitle: string;
  accent: string;
}

export const DAILY_CHALLENGE_SIZE = 7;

function questionPool(generatedLessons: GeneratedLesson[]): ChallengeRef[] {
  const pool: ChallengeRef[] = [];
  for (const lesson of generatedLessons) {
    const subject = getSubject(lesson.subjectId);
    lesson.cards.forEach((card, cardIndex) => {
      if (card.type === 'quiz' || card.type === 'truefalse' || card.type === 'fillblank') {
        pool.push({
          id: makeItemId(lesson.id, cardIndex),
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          subjectId: lesson.subjectId,
          subjectTitle: subject?.title ?? 'AI',
          accent: subject?.accent ?? '#6366f1',
          cardIndex,
          card,
        });
      }
    });
  }
  return pool;
}

/**
 * A stable, date-seeded set of mixed questions from generated lessons.
 */
export function buildDailyChallenge(
  dayKey: string,
  generatedLessons: GeneratedLesson[],
  size: number = DAILY_CHALLENGE_SIZE,
): ChallengeRef[] {
  const pool = questionPool(generatedLessons);
  if (pool.length === 0) return [];
  const rnd = mulberry32(seedFromString(`challenge:${dayKey}`));
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
