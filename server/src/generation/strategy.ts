import type { LessonGenerationMode } from './types';

export interface LessonGenerationStrategyInput {
  slideCount?: number;
  masteryLevel?: number;
  depth?: string;
  topic?: string;
  subject?: string;
  sourceText?: string;
}

const HARD_TOPIC_PATTERN =
  /fourier|transform|linear algebra|probability|statistics|optimization|calculus|differential equations|machine learning|transformer|algorithms?|systems?|compilers?|distributed|cryptography|information theory|bayes|matrix|tensor|gradient|neural|database|operating system|attention|inference|vllm/i;

const MATH_TOPIC_PATTERN =
  /fourier|transform|linear algebra|probability|statistics|optimization|calculus|differential equations|matrix|tensor|gradient|bayes|algebra|integral|derivative|eigen|vector/i;

const CODE_TOPIC_PATTERN =
  /algorithm|data structure|compiler|systems?|database|api|runtime|debug|implementation|programming|react|typescript|javascript|python|machine learning|transformer|neural|operating system|attention|inference/i;

export function isMathHeavy(subject = '', topic = ''): boolean {
  return MATH_TOPIC_PATTERN.test(`${subject} ${topic}`);
}

export function isCodeHeavy(subject = '', topic = ''): boolean {
  return CODE_TOPIC_PATTERN.test(`${subject} ${topic}`);
}

export function isHardTopic(subject = '', topic = ''): boolean {
  const text = `${subject} ${topic}`;
  return HARD_TOPIC_PATTERN.test(text) || isMathHeavy(subject, topic) || isCodeHeavy(subject, topic);
}

export function inferLessonGenerationMode(input: LessonGenerationStrategyInput): LessonGenerationMode {
  const slideCount = input.slideCount ?? 8;
  const masteryLevel = input.masteryLevel ?? 3;
  const depth = input.depth?.toLowerCase();
  const topic = input.topic ?? '';
  const hard = isHardTopic(input.subject ?? '', topic);

  if (masteryLevel >= 5 && slideCount >= 12 && hard) return 'expert';
  if (slideCount >= 11 || masteryLevel >= 4 || depth === 'deep') {
    return hard || slideCount >= 12 ? 'heavy' : 'rich';
  }
  if (slideCount <= 6 && masteryLevel <= 2) return 'light';
  if (slideCount <= 10 && masteryLevel <= 3) return 'rich';
  return 'heavy';
}
