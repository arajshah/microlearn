import { MasteryLevel } from '@/data/mastery';
import { Subject, SubjectId } from '@/types/content';

export type LessonGenerationMode = 'light' | 'rich' | 'heavy' | 'expert';

export interface LessonGenerationStrategyInput {
  slideCount?: number;
  masteryLevel?: MasteryLevel | number;
  depth?: string;
  topic?: string;
  subject?: Subject | SubjectId | string;
  sourceText?: string;
}

const HARD_TOPIC_PATTERN =
  /fourier|transform|linear algebra|probability|statistics|optimization|calculus|differential equations|machine learning|transformer|algorithms?|systems?|compilers?|distributed|cryptography|information theory|bayes|matrix|tensor|gradient|neural|database|operating system/i;

const MATH_TOPIC_PATTERN =
  /fourier|transform|linear algebra|probability|statistics|optimization|calculus|differential equations|matrix|tensor|gradient|bayes|algebra|integral|derivative|eigen|vector/i;

const CODE_TOPIC_PATTERN =
  /algorithm|data structure|compiler|systems?|database|api|runtime|debug|implementation|programming|react|typescript|javascript|python|machine learning|transformer|neural|operating system/i;

function subjectText(subject: LessonGenerationStrategyInput['subject']): string {
  if (!subject) return '';
  if (typeof subject === 'string') return subject;
  return `${subject.id} ${subject.title} ${subject.tagline}`;
}

export function isMathHeavy(
  subject?: LessonGenerationStrategyInput['subject'],
  topic = '',
): boolean {
  return MATH_TOPIC_PATTERN.test(`${subjectText(subject)} ${topic}`);
}

export function isCodeHeavy(
  subject?: LessonGenerationStrategyInput['subject'],
  topic = '',
): boolean {
  return CODE_TOPIC_PATTERN.test(`${subjectText(subject)} ${topic}`);
}

export function isHardTopic(
  subject?: LessonGenerationStrategyInput['subject'],
  topic = '',
): boolean {
  return HARD_TOPIC_PATTERN.test(`${subjectText(subject)} ${topic}`) || isMathHeavy(subject, topic) || isCodeHeavy(subject, topic);
}

export function inferLessonGenerationMode(input: LessonGenerationStrategyInput): LessonGenerationMode {
  const slideCount = input.slideCount ?? 8;
  const masteryLevel = input.masteryLevel ?? 3;
  const depth = input.depth?.toLowerCase();
  const topic = input.topic ?? '';
  const hard = isHardTopic(input.subject, topic);

  if (masteryLevel >= 5 && slideCount >= 12 && hard) return 'expert';
  if (slideCount >= 11 || masteryLevel >= 4 || depth === 'deep') return hard || slideCount >= 12 ? 'heavy' : 'rich';
  if (slideCount <= 6 && masteryLevel <= 2) return 'light';
  if (slideCount <= 10 && masteryLevel <= 3) return 'rich';
  return 'heavy';
}
