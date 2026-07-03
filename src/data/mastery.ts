/** Learner mastery scale (1 = brand new, 5 = expert). */
export type MasteryLevel = 1 | 2 | 3 | 4 | 5;

export interface MasteryTier {
  level: MasteryLevel;
  name: string;
  tagline: string;
  /** Target card count range for AI-generated lessons. */
  cardRange: [number, number];
  /** Target lesson duration in minutes. */
  minutesRange: [number, number];
  depth: string;
}

export const MASTERY_TIERS: MasteryTier[] = [
  {
    level: 1,
    name: 'Curious',
    tagline: 'Brand new to this',
    cardRange: [5, 6],
    minutesRange: [3, 4],
    depth: 'Simple language, one idea per card, gentle pace, many examples.',
  },
  {
    level: 2,
    name: 'Exploring',
    tagline: 'Getting familiar',
    cardRange: [6, 8],
    minutesRange: [4, 5],
    depth: 'Clear explanations with a few connecting ideas and checks.',
  },
  {
    level: 3,
    name: 'Practicing',
    tagline: 'Solid foundation',
    cardRange: [7, 9],
    minutesRange: [5, 7],
    depth: 'Balanced depth — mix concepts, applications, and harder questions.',
  },
  {
    level: 4,
    name: 'Proficient',
    tagline: 'Comfortable & sharp',
    cardRange: [8, 10],
    minutesRange: [6, 8],
    depth: 'Deeper analysis, nuance, edge cases, and rigorous checks.',
  },
  {
    level: 5,
    name: 'Expert',
    tagline: 'Advanced mastery',
    cardRange: [10, 12],
    minutesRange: [7, 10],
    depth: 'University-level rigor, precise terminology, challenging synthesis.',
  },
];

export function getMasteryTier(level: MasteryLevel): MasteryTier {
  return MASTERY_TIERS.find((t) => t.level === level) ?? MASTERY_TIERS[2];
}

/** Migrate legacy onboarding values. */
export function normalizeMasteryLevel(raw: unknown): MasteryLevel {
  if (typeof raw === 'number' && raw >= 1 && raw <= 5) return raw as MasteryLevel;
  if (raw === 'new') return 1;
  if (raw === 'some') return 3;
  if (raw === 'advanced') return 5;
  return 3;
}
