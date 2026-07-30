import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestJsonCompletion } from '@/ai/jsonCompletion';
import { AiConfig } from '@/types/content';
import { GeneratedLesson, QuizCard, SubjectId } from '@/types/content';
import { subjects, getSubject } from '@/data/subjects';
import { mulberry32, seedFromString } from '@/utils/random';

const CACHE_KEY = 'microlearn.challengeOfDay.v1';
export const CHALLENGE_QUESTION_COUNT = 5;

export interface ChallengeQuestion {
  id: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface DailyChallenge {
  dayKey: string;
  subjectId: SubjectId;
  subjectTitle: string;
  accent: string;
  topic: string;
  questions: ChallengeQuestion[];
  source: 'ai' | 'fallback' | 'lesson';
}

interface CachedChallenge {
  dayKey: string;
  challenge: DailyChallenge;
}

function pickSubject(dayKey: string): (typeof subjects)[number] {
  const rnd = mulberry32(seedFromString(`challenge-subject:${dayKey}`));
  const idx = Math.floor(rnd() * subjects.length);
  return subjects[idx];
}

function pickTopic(
  dayKey: string,
  subjectId: SubjectId,
  generatedLessons: GeneratedLesson[],
): { topic: string; fromLesson?: GeneratedLesson } {
  const fromSubject = generatedLessons.filter((l) => l.subjectId === subjectId);
  const pool = generatedLessons.length > 0 ? generatedLessons : fromSubject;
  if (pool.length > 0) {
    const rnd = mulberry32(seedFromString(`challenge-topic:${dayKey}`));
    const lesson = pool[Math.floor(rnd() * pool.length)];
    return { topic: lesson.topic || lesson.title, fromLesson: lesson };
  }
  const subject = getSubject(subjectId);
  return { topic: subject?.tagline ?? subject?.title ?? 'General knowledge' };
}

function buildFallbackQuestions(
  dayKey: string,
  subjectId: SubjectId,
  topic: string,
): ChallengeQuestion[] {
  const subject = getSubject(subjectId);
  const title = subject?.title ?? 'Learning';
  const rnd = mulberry32(seedFromString(`challenge-fallback:${dayKey}:${subjectId}`));
  const templates = [
    {
      question: `In ${title}, what is a core idea behind "${topic}"?`,
      options: [
        'It helps explain patterns in the real world',
        'It has no practical use',
        'It only applies to one fixed example',
        'It contradicts basic reasoning',
      ],
      answerIndex: 0,
      explanation: `${topic} is worth studying because it builds useful mental models.`,
    },
    {
      question: `Which study habit best supports learning ${title}?`,
      options: [
        'Passive rereading only',
        'Active recall and spaced review',
        'Skipping hard parts',
        'Memorizing without understanding',
      ],
      answerIndex: 1,
      explanation: 'Active recall and spaced review strengthen long-term memory.',
    },
    {
      question: `True focus for today's ${title} challenge:`,
      options: [
        topic,
        'Unrelated trivia',
        'Random guessing',
        'None of the above',
      ],
      answerIndex: 0,
      explanation: `Today's challenge topic is "${topic}".`,
    },
    {
      question: `What should you do when a ${title} concept feels unclear?`,
      options: [
        'Give up immediately',
        'Break it into smaller questions and examples',
        'Ignore it forever',
        'Only memorize labels',
      ],
      answerIndex: 1,
      explanation: 'Breaking concepts into smaller pieces makes them easier to learn.',
    },
    {
      question: `Why mix subjects like ${title} into daily practice?`,
      options: [
        'To build flexible thinking',
        'To avoid learning anything deeply',
        'To reduce curiosity',
        'To make recall harder on purpose only',
      ],
      answerIndex: 0,
      explanation: 'Varied practice helps you connect ideas across domains.',
    },
  ];
  const out: ChallengeQuestion[] = [];
  for (let i = 0; i < CHALLENGE_QUESTION_COUNT; i++) {
    const t = templates[i % templates.length];
    out.push({
      id: `fallback-${dayKey}-${i}`,
      question: t.question,
      options: [...t.options],
      answerIndex: t.answerIndex,
      explanation: t.explanation,
    });
  }
  void rnd;
  return out;
}

function questionsFromLesson(lesson: GeneratedLesson, dayKey: string): ChallengeQuestion[] {
  const out: ChallengeQuestion[] = [];
  for (let i = 0; i < lesson.cards.length && out.length < CHALLENGE_QUESTION_COUNT; i++) {
    const card = lesson.cards[i];
    if (card.type === 'quiz' && Array.isArray(card.options) && card.options.length > 0) {
      out.push({
        id: `lesson-${lesson.id}-${i}`,
        question: card.question,
        options: card.options,
        answerIndex: card.answerIndex ?? 0,
        explanation: card.explanation ?? 'Review the lesson for more detail.',
      });
    }
    if (card.type === 'truefalse') {
      out.push({
        id: `lesson-${lesson.id}-${i}`,
        question: card.statement,
        options: ['False', 'True'],
        answerIndex: card.answer ? 1 : 0,
        explanation: card.explanation ?? '',
      });
    }
  }
  if (out.length >= 3) return out.slice(0, CHALLENGE_QUESTION_COUNT);
  return [];
}

async function generateAiQuestions(
  config: AiConfig,
  subjectTitle: string,
  topic: string,
  dayKey: string,
): Promise<ChallengeQuestion[] | null> {
  try {
    const raw = await requestJsonCompletion(
      config,
      'You write short multiple-choice quiz questions as JSON. Return {"questions":[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"explanation":"..."}]} with exactly 5 questions.',
      `Subject: ${subjectTitle}\nTopic: ${topic}\nDay: ${dayKey}\nWrite 5 concise multiple-choice questions. answerIndex is 0-based.`,
      1800,
    );
    const parsed = JSON.parse(raw) as {
      questions?: Array<{
        question?: string;
        options?: string[];
        answerIndex?: number;
        explanation?: string;
      }>;
    };
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) return null;
    const questions: ChallengeQuestion[] = [];
    for (let i = 0; i < parsed.questions.length && questions.length < CHALLENGE_QUESTION_COUNT; i++) {
      const q = parsed.questions[i];
      if (!q?.question || !Array.isArray(q.options) || q.options.length < 2) continue;
      const answerIndex =
        typeof q.answerIndex === 'number' && q.answerIndex >= 0 && q.answerIndex < q.options.length
          ? q.answerIndex
          : 0;
      questions.push({
        id: `ai-${dayKey}-${i}`,
        question: q.question,
        options: q.options.filter((o): o is string => typeof o === 'string'),
        answerIndex,
        explanation: q.explanation ?? 'Good effort — review the topic to reinforce this.',
      });
    }
    return questions.length >= 3 ? questions : null;
  } catch {
    return null;
  }
}

export async function getTodayChallenge(input: {
  dayKey: string;
  generatedLessons: GeneratedLesson[];
  config?: AiConfig;
  hasKey: boolean;
}): Promise<DailyChallenge> {
  const { dayKey, generatedLessons, config, hasKey } = input;

  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as CachedChallenge;
      if (cached.dayKey === dayKey && cached.challenge?.questions?.length > 0) {
        return cached.challenge;
      }
    }
  } catch {
    /* regenerate */
  }

  const subject = pickSubject(dayKey);
  const { topic, fromLesson } = pickTopic(dayKey, subject.id, generatedLessons);

  let questions: ChallengeQuestion[] = [];
  let source: DailyChallenge['source'] = 'fallback';

  if (fromLesson) {
    questions = questionsFromLesson(fromLesson, dayKey);
    if (questions.length >= 3) source = 'lesson';
  }

  if (questions.length < 3 && hasKey && config?.apiKey) {
    const ai = await generateAiQuestions(config, subject.title, topic, dayKey);
    if (ai && ai.length >= 3) {
      questions = ai;
      source = 'ai';
    }
  }

  if (questions.length < 3) {
    questions = buildFallbackQuestions(dayKey, subject.id, topic);
    source = 'fallback';
  }

  const challenge: DailyChallenge = {
    dayKey,
    subjectId: subject.id,
    subjectTitle: subject.title,
    accent: subject.accent,
    topic,
    questions: questions.slice(0, CHALLENGE_QUESTION_COUNT),
    source,
  };

  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ dayKey, challenge }));
  return challenge;
}

export function challengeQuestionToCard(q: ChallengeQuestion): QuizCard {
  return {
    type: 'quiz',
    question: q.question,
    options: q.options,
    answerIndex: q.answerIndex,
    explanation: q.explanation,
  };
}
