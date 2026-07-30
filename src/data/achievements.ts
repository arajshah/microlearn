import { Ionicons } from '@expo/vector-icons';
import { CompletedLesson } from '@/context/ProgressContext';
import { SubjectId } from '@/types/content';

export interface AchievementView {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  unlocked: boolean;
  /** 0..1 progress toward unlocking. */
  progress: number;
}

interface Snapshot {
  totalXp: number;
  longestStreak: number;
  streak: number;
  completed: Record<string, CompletedLesson>;
}

export function deriveAchievements(s: Snapshot): AchievementView[] {
  const records = Object.values(s.completed);
  const subjectsTouched = new Set(records.map((r) => r.subjectId));
  const lessonsPerSubject = new Map<SubjectId, number>();
  for (const r of records) {
    lessonsPerSubject.set(r.subjectId, (lessonsPerSubject.get(r.subjectId) ?? 0) + 1);
  }
  const deepestSubject = Math.max(0, ...lessonsPerSubject.values());
  const perfectLessons = records.filter(
    (r) => r.total > 0 && r.correct === r.total,
  ).length;

  const clamp = (n: number) => Math.max(0, Math.min(1, n));

  return [
    {
      id: 'first-step',
      title: 'First Step',
      description: 'Complete your first lesson',
      icon: 'footsteps',
      unlocked: records.length >= 1,
      progress: clamp(records.length / 1),
    },
    {
      id: 'curious-five',
      title: 'Getting Curious',
      description: 'Complete 5 lessons',
      icon: 'sparkles',
      unlocked: records.length >= 5,
      progress: clamp(records.length / 5),
    },
    {
      id: 'xp-250',
      title: 'Knowledge Seeker',
      description: 'Earn 250 XP',
      icon: 'star',
      unlocked: s.totalXp >= 250,
      progress: clamp(s.totalXp / 250),
    },
    {
      id: 'xp-1000',
      title: 'Scholar',
      description: 'Earn 1,000 XP',
      icon: 'ribbon',
      unlocked: s.totalXp >= 1000,
      progress: clamp(s.totalXp / 1000),
    },
    {
      id: 'streak-3',
      title: 'On a Roll',
      description: 'Reach a 3-day streak',
      icon: 'flame',
      unlocked: s.longestStreak >= 3,
      progress: clamp(s.longestStreak / 3),
    },
    {
      id: 'streak-7',
      title: 'Week Warrior',
      description: 'Reach a 7-day streak',
      icon: 'bonfire',
      unlocked: s.longestStreak >= 7,
      progress: clamp(s.longestStreak / 7),
    },
    {
      id: 'perfect',
      title: 'Flawless',
      description: 'Ace a lesson with 100% accuracy',
      icon: 'checkmark-done-circle',
      unlocked: perfectLessons >= 1,
      progress: clamp(perfectLessons / 1),
    },
    {
      id: 'polymath',
      title: 'Polymath',
      description: 'Study four different subjects',
      icon: 'planet',
      unlocked: subjectsTouched.size >= 4,
      progress: clamp(subjectsTouched.size / 4),
    },
    {
      id: 'subject-master',
      title: 'Subject Master',
      description: 'Complete 5 lessons in one subject',
      icon: 'trophy',
      unlocked: deepestSubject >= 5,
      progress: clamp(deepestSubject / 5),
    },
  ];
}
