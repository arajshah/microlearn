import { Subject, SubjectId } from '@/types/content';

/** Subject taxonomy for Create UI — no built-in lesson content. */
export const subjects: Subject[] = [
  {
    id: 'economics',
    title: 'Economics',
    tagline: 'How the world allocates what it wants',
    description:
      'From scarcity and incentives to markets, money, and macro. Build intuition for the forces shaping prices, jobs, and nations.',
    icon: 'trending-up',
    gradient: ['#0FB37D', '#0A7A57'],
    accent: '#2BD4A0',
    units: [],
  },
  {
    id: 'philosophy',
    title: 'Philosophy',
    tagline: 'The art of thinking clearly about everything',
    description:
      'Ethics, knowledge, logic, and the mind. Learn the questions and tools that have shaped 2,500 years of human thought.',
    icon: 'bulb',
    gradient: ['#F0A23B', '#C8761B'],
    accent: '#FFC061',
    units: [],
  },
  {
    id: 'literature',
    title: 'Literature',
    tagline: 'How stories make meaning',
    description:
      'Story, style, and the great movements of writing. Learn to read deeply and see the machinery behind the books that move us.',
    icon: 'book',
    gradient: ['#F0567E', '#C12B58'],
    accent: '#FF7DA0',
    units: [],
  },
  {
    id: 'computer-science',
    title: 'Computer Science',
    tagline: 'The science of solving problems with machines',
    description:
      'Algorithms, data, and the ideas that power computing. Build true intuition for how software thinks — no jargon required.',
    icon: 'code-slash',
    gradient: ['#3B82F6', '#1D4ED8'],
    accent: '#60A5FA',
    units: [],
  },
  {
    id: 'history',
    title: 'History',
    tagline: 'How the past shapes the present',
    description:
      'From ancient civilizations to revolutions and world wars — understand the forces, people, and ideas that built our world.',
    icon: 'time',
    gradient: ['#8B4513', '#5C2E0A'],
    accent: '#D4A574',
    units: [],
  },
  {
    id: 'psychology',
    title: 'Psychology',
    tagline: 'Understand minds — yours and others',
    description:
      'Memory, motivation, bias, and behavior. Build a practical mental model of how people think, feel, and decide.',
    icon: 'heart',
    gradient: ['#9B59B6', '#6C3483'],
    accent: '#C39BD3',
    units: [],
  },
  {
    id: 'mathematics',
    title: 'Mathematics',
    tagline: 'Patterns, proof, and problem-solving',
    description:
      'From logic and probability to functions and growth — build intuition for the language behind science and data.',
    icon: 'calculator',
    gradient: ['#2980B9', '#1A5276'],
    accent: '#5DADE2',
    units: [],
  },
];

export function getSubject(id: SubjectId | string): Subject | undefined {
  return subjects.find((s) => s.id === id);
}

export function subjectProgressFromCompleted(
  subjectId: SubjectId,
  completedIds: Set<string>,
  lessonsBySubject: Map<SubjectId, string[]>,
): { done: number; total: number; pct: number } {
  const ids = lessonsBySubject.get(subjectId) ?? [];
  const done = ids.filter((id) => completedIds.has(id)).length;
  const total = ids.length;
  return { done, total, pct: total ? done / total : 0 };
}
