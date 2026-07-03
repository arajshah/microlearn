import { MasteryLevel } from '@/data/mastery';
import { DifficultyTrack, Lesson, Subject, SubjectId, Unit } from '@/types/content';
import { countGradedCards } from '@/utils/cards';
import { economics } from './economics';
import { philosophy } from './philosophy';
import { literature } from './literature';
import { computerScience } from './computerScience';
import { history } from './history';
import { psychology } from './psychology';
import { mathematics } from './mathematics';

export const subjects: Subject[] = [
  economics,
  philosophy,
  literature,
  computerScience,
  history,
  psychology,
  mathematics,
];

const TRACKS: DifficultyTrack[] = ['beginner', 'intermediate', 'advanced'];

/** Fill in difficulty + prerequisites for units that omit them. */
export function normalizedUnits(subject: Subject): Unit[] {
  return subject.units.map((unit, i) => {
    const difficulty = unit.difficulty ?? TRACKS[Math.min(i, TRACKS.length - 1)];
    const prerequisites =
      unit.prerequisites ??
      (i > 0 ? [subject.units[i - 1].id] : undefined);
    return { ...unit, difficulty, prerequisites };
  });
}

export function isUnitUnlocked(
  unit: Unit,
  subject: Subject,
  isLessonComplete: (id: string) => boolean,
): boolean {
  const prereqs = unit.prerequisites ?? [];
  if (prereqs.length === 0) return true;
  for (const unitId of prereqs) {
    const prereqUnit = subject.units.find((u) => u.id === unitId);
    if (!prereqUnit) continue;
    const allDone = prereqUnit.lessons.every((l) => isLessonComplete(l.id));
    if (!allDone) return false;
  }
  return true;
}

export function unitsForTrack(subject: Subject, track: DifficultyTrack | 'all'): Unit[] {
  const units = normalizedUnits(subject);
  if (track === 'all') return units;
  return units.filter((u) => u.difficulty === track);
}

/** Filter units by learner mastery level (cumulative path). */
export function unitsForMastery(subject: Subject, level: MasteryLevel | 'all'): Unit[] {
  const units = normalizedUnits(subject);
  if (level === 'all') return units;
  return units.filter((u) => {
    const d = u.difficulty ?? 'beginner';
    if (level <= 2) return d === 'beginner';
    if (level === 3) return d === 'beginner' || d === 'intermediate';
    return true;
  });
}

export function getSubject(id: SubjectId | string): Subject | undefined {
  return subjects.find((s) => s.id === id);
}

export interface LessonLocation {
  subject: Subject;
  unit: Unit;
  lesson: Lesson;
  subjectLessonIndex: number;
}

export function findLesson(lessonId: string): LessonLocation | undefined {
  for (const subject of subjects) {
    let idx = 0;
    for (const unit of subject.units) {
      for (const lesson of unit.lessons) {
        if (lesson.id === lessonId) {
          return { subject, unit, lesson, subjectLessonIndex: idx };
        }
        idx++;
      }
    }
  }
  return undefined;
}

export function allLessons(): LessonLocation[] {
  const out: LessonLocation[] = [];
  for (const subject of subjects) {
    let idx = 0;
    for (const unit of subject.units) {
      for (const lesson of unit.lessons) {
        out.push({ subject, unit, lesson, subjectLessonIndex: idx });
        idx++;
      }
    }
  }
  return out;
}

export function subjectLessons(subject: Subject): Lesson[] {
  return subject.units.flatMap((u) => u.lessons);
}

export function lessonXp(lesson: Lesson): number {
  return 10 + countGradedCards(lesson.cards) * 5;
}

export const totalLessonCount = allLessons().length;

export const TRACK_LABELS: Record<DifficultyTrack, string> = {
  beginner: 'Foundations',
  intermediate: 'Core',
  advanced: 'Advanced',
};
