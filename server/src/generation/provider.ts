import { ApiError } from '../api/apiError';
import { logger } from '../logger';

/** Options for chat-style text generation. Lesson/roadmap callers keep defaults. */
export interface TextGenerationOptions {
  maxTokens: number;
  /** Defaults to 0.55 for lesson/roadmap generation. Tutor uses a lower value. */
  temperature?: number;
}

export const DEFAULT_TEXT_TEMPERATURE = 0.55;
export const TUTOR_TEXT_TEMPERATURE = 0.28;
export const TUTOR_MAX_TOKENS = 450;

export interface AiGenerationProvider {
  readonly model: string;
  requestJson(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string>;
  requestRaw(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string>;
  requestText(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    maxTokensOrOptions: number | TextGenerationOptions,
  ): Promise<string>;
}

function resolveTextOptions(maxTokensOrOptions: number | TextGenerationOptions): {
  maxTokens: number;
  temperature: number;
} {
  if (typeof maxTokensOrOptions === 'number') {
    return { maxTokens: maxTokensOrOptions, temperature: DEFAULT_TEXT_TEMPERATURE };
  }
  return {
    maxTokens: maxTokensOrOptions.maxTokens,
    temperature:
      typeof maxTokensOrOptions.temperature === 'number'
        ? maxTokensOrOptions.temperature
        : DEFAULT_TEXT_TEMPERATURE,
  };
}

/** Extract only assistant-visible answer content; ignore provider reasoning fields. */
export function extractAssistantVisibleContent(data: unknown): string {
  const payload = data as {
    choices?: Array<{
      message?: {
        content?: string | null;
        reasoning?: string | null;
        reasoning_content?: string | null;
      };
      text?: string | null;
      reasoning?: string | null;
    }>;
  };
  const choice = payload.choices?.[0];
  const content = choice?.message?.content ?? choice?.text ?? '';
  return typeof content === 'string' ? content : '';
}

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_MODEL = 'gemma-4-31b-it';
const DEFAULT_TIMEOUT_MS = 45_000;

export function calculateBackoffMs(attempt: number, jitter = Math.random()): number {
  const base = 1000 * 2 ** Math.max(0, attempt - 1);
  return Math.round(base + Math.min(750, Math.max(0, jitter) * 500));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadProviderConfig(): ProviderConfig {
  const apiKey = process.env.MICROLEARN_AI_API_KEY?.trim() ?? '';
  if (!apiKey) {
    throw new ApiError(
      503,
      'Server AI provider is not configured. Set MICROLEARN_AI_API_KEY on the Microlearn backend.',
      'AI_CONFIG_MISSING',
    );
  }
  const baseUrl = process.env.MICROLEARN_AI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const model = process.env.MICROLEARN_AI_MODEL?.trim() || DEFAULT_MODEL;
  const timeoutRaw = Number.parseInt(process.env.MICROLEARN_AI_TIMEOUT_MS ?? '', 10);
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    model,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function safeErrorForStatus(status: number): ApiError {
  if (status === 401 || status === 403) {
    return new ApiError(503, 'Server AI provider credentials were rejected.', 'AI_CONFIG_INVALID');
  }
  if (status === 429) {
    return new ApiError(429, 'AI provider is rate limited. Try again shortly.', 'AI_RATE_LIMITED');
  }
  if (status === 408 || status === 504) {
    return new ApiError(504, 'AI provider timed out. Try again.', 'AI_PROVIDER_TIMEOUT');
  }
  if (status >= 500) {
    return new ApiError(503, 'AI provider is temporarily unavailable. Try again.', 'AI_PROVIDER_UNAVAILABLE');
  }
  return new ApiError(502, 'AI provider request failed.', 'AI_PROVIDER_FAILED');
}

async function readProviderCode(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { code?: string } } | null;
    return json?.error?.code ?? '';
  } catch {
    return '';
  }
}

class OpenAiCompatibleProvider implements AiGenerationProvider {
  readonly model: string;

  constructor(private readonly config: ProviderConfig) {
    this.model = config.model;
  }

  async requestJson(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
    return this.requestCompletion(systemPrompt, [{ role: 'user', content: userPrompt }], maxTokens, true);
  }

  async requestRaw(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
    return this.requestCompletion(systemPrompt, [{ role: 'user', content: userPrompt }], maxTokens, false);
  }

  async requestText(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    maxTokensOrOptions: number | TextGenerationOptions,
  ): Promise<string> {
    const options = resolveTextOptions(maxTokensOrOptions);
    return this.requestCompletion(
      systemPrompt,
      messages,
      options.maxTokens,
      false,
      options.temperature,
    );
  }

  private async requestCompletion(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    maxTokens: number,
    jsonMode: boolean,
    temperature: number = DEFAULT_TEXT_TEMPERATURE,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    };
    if (jsonMode) body.response_format = { type: 'json_object' };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const providerCode = await readProviderCode(res);
          if (attempt < maxAttempts && isRetryableStatus(res.status)) {
            const delayMs = calculateBackoffMs(attempt);
            logger.warn('AI provider retryable failure', {
              status: res.status,
              providerCode,
              attempt,
              delayMs,
            });
            await sleep(delayMs);
            continue;
          }
          throw safeErrorForStatus(res.status);
        }
        const data: unknown = await res.json();
        const content = extractAssistantVisibleContent(data);
        if (!content.trim()) {
          throw new ApiError(502, 'AI provider returned an empty response.', 'AI_EMPTY_RESPONSE');
        }
        return content;
      } catch (err) {
        if (err instanceof ApiError) throw err;
        const aborted = err instanceof Error && err.name === 'AbortError';
        if (attempt < maxAttempts && aborted) {
          const delayMs = calculateBackoffMs(attempt);
          logger.warn('AI provider timeout; retrying', { attempt, delayMs });
          await sleep(delayMs);
          continue;
        }
        throw new ApiError(
          aborted ? 504 : 503,
          aborted ? 'AI provider timed out. Try again.' : 'Could not reach AI provider. Try again.',
          aborted ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE',
        );
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ApiError(503, 'AI provider is temporarily unavailable. Try again.', 'AI_PROVIDER_UNAVAILABLE');
  }
}

class FakeDeterministicProvider implements AiGenerationProvider {
  readonly model = 'fake-deterministic-v1';

  private richCards(topic: string) {
    return [
      { type: 'hook', id: 'c1', title: topic, body: `Introduce ${topic} with a concrete motivation.` },
      {
        type: 'recall',
        id: 'c2',
        prompt: 'Recall prerequisites',
        body: 'Activate prior knowledge before the formal details.',
      },
      {
        type: 'visual_model',
        id: 'c3',
        title: 'Mental model',
        visualDescription: `Flow for ${topic}`,
        body: 'See how inputs move through the core mechanism.',
        takeaway: 'A visual anchor makes the math easier to remember.',
        diagram: {
          kind: 'flow',
          nodes: [
            { id: 'a', label: 'Input' },
            { id: 'b', label: topic },
            { id: 'c', label: 'Output' },
          ],
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' },
          ],
        },
      },
      {
        type: 'formula',
        id: 'c4',
        title: `${topic} notation`,
        formula: 'y = f(x; θ)',
        plainEnglish: 'The model maps inputs x to outputs y using parameters θ.',
        body: 'Use this notation consistently across the lesson.',
      },
      {
        type: 'worked_example',
        id: 'c5',
        title: 'Worked example',
        problem: `Apply ${topic} to a small numeric case.`,
        steps: [{ label: 'Step 1', work: 'Set up the inputs', explanation: 'Identify x and θ.' }],
        answer: 'The output matches the expected behavior.',
        insight: 'The example shows the concept in action.',
      },
      {
        type: 'misconception_check',
        id: 'c6',
        misconception: `Treating ${topic} as memorization instead of mechanism.`,
        question: `Which statement about ${topic} is most accurate?`,
        options: ['It is a reusable mechanism', 'It is only a definition', 'It never fails'],
        answerIndex: 0,
        explanation: 'Focus on mechanism and assumptions, not rote recall.',
      },
      {
        type: 'application',
        id: 'c7',
        question: `Where would ${topic} matter in practice?`,
        options: ['Inference systems', 'Unrelated trivia', 'Random noise'],
        answerIndex: 0,
        explanation: 'Connect the concept to real systems and tradeoffs.',
      },
      {
        type: 'summary',
        id: 'c8',
        title: 'Summary',
        points: [`${topic} maps inputs to outputs`, 'Watch assumptions and edge cases', 'Use checks to verify understanding'],
      },
      {
        type: 'next_connection',
        id: 'c9',
        body: 'Next you will extend this idea to more complex settings.',
        nextTitle: 'Next lesson',
      },
    ];
  }

  private blueprint(topic: string, objective: string) {
    return {
      title: topic,
      primaryObjective: objective,
      prerequisiteRecall: ['Recall the previous lesson vocabulary.'],
      keyIdeas: [topic, 'mechanism', 'application'],
      explanationPlan: [`Define ${topic}`, `Explain why ${topic} matters`],
      examplePlan: [`Walk through a worked example of ${topic}`],
      interactionPlan: [
        { type: 'multiple_choice', purpose: 'Check core idea', conceptTested: topic },
        { type: 'true_false', purpose: 'Check precision', conceptTested: topic },
      ],
      misconceptionChecks: [
        {
          misconception: `Confusing ${topic} with a superficial definition`,
          diagnosticQuestion: `What is the best way to use ${topic}?`,
          correctionGoal: 'Emphasize mechanism over memorization.',
        },
      ],
      applicationPlan: [`Apply ${topic} to a realistic scenario`],
      summaryPoints: [`${topic} in one sentence`, 'Key assumptions', 'When to use it'],
      estimatedMinutes: 8,
      coreMentalModel: `${topic} is a reusable mechanism, not a label.`,
      workedExamplePlan: `Numeric walkthrough for ${topic}`,
      conceptTags: [topic.toLowerCase().replace(/\s+/g, '-')],
      skillTags: ['analysis'],
    };
  }

  async requestJson(_systemPrompt: string, userPrompt: string, _maxTokens: number): Promise<string> {
    const topicMatch = userPrompt.match(/Lesson: "([^"]+)"/) ?? userPrompt.match(/Topic: "([^"]+)"/);
    const topic = topicMatch?.[1] ?? 'Test Topic';
    const objectiveMatch = userPrompt.match(/Required objective: ([^\n]+)/);
    const objective = objectiveMatch?.[1]?.trim() ?? `Understand ${topic}`;

    if (userPrompt.includes('learning roadmap') || userPrompt.includes('Target exactly')) {
      const countMatch = userPrompt.match(/Target exactly (\d+) lessons/);
      const lessonCount = countMatch ? Number.parseInt(countMatch[1], 10) : 2;
      const lessons = Array.from({ length: Math.max(2, lessonCount) }, (_, i) => ({
        id: `l${i + 1}`,
        title: i === 0 ? `${topic} Basics` : `${topic} Lesson ${i + 1}`,
        shortDescription: 'Core ideas',
        learningObjective: i === 0 ? `Explain the basics of ${topic}` : `Apply ${topic}`,
        estimatedMinutes: 8,
        difficulty: 2 + (i % 2),
        order: i + 1,
        prerequisiteIds: i === 0 ? [] : [`l${i}`],
        keyIdeas: [`idea-${i + 1}`],
      }));
      const mid = Math.ceil(lessons.length / 2);
      return JSON.stringify({
        title: `${topic} Roadmap`,
        description: `Learn ${topic} step by step.`,
        estimatedTotalMinutes: lessons.length * 8,
        units: [
          {
            title: 'Foundations',
            description: 'Core concepts',
            order: 1,
            lessons: lessons.slice(0, mid),
          },
          {
            title: 'Application',
            description: 'Apply the ideas',
            order: 2,
            lessons: lessons.slice(mid),
          },
        ],
      });
    }

    if (userPrompt.includes('lesson blueprint') || userPrompt.includes('Create a lesson blueprint')) {
      return JSON.stringify(this.blueprint(topic, objective));
    }

    if (userPrompt.includes('compact lesson plan') || userPrompt.includes('Create a compact lesson plan')) {
      const slides = this.richCards(topic).map((c, i) => ({
        index: i + 1,
        id: c.id,
        requiredType: c.type,
        title: String(c.title ?? c.type),
        purpose: `Teach ${c.type}`,
        keyIdea: topic,
      }));
      return JSON.stringify({
        title: topic,
        subtitle: objective,
        primaryObjective: objective,
        coreMentalModel: `${topic} as mechanism`,
        slideCount: slides.length,
        slides,
      });
    }

    if (userPrompt.includes('Materialize this lesson')) {
      return JSON.stringify({
        title: topic,
        subtitle: objective,
        minutes: 8,
        primaryObjective: objective,
        conceptTags: [topic.toLowerCase().replace(/\s+/g, '-')],
        skillTags: ['analysis'],
        cards: this.richCards(topic),
      });
    }

    return JSON.stringify({
      title: topic,
      subtitle: objective,
      minutes: 8,
      primaryObjective: objective,
      conceptTags: ['verification'],
      skillTags: ['testing'],
      cards: this.richCards(topic),
    });
  }

  async requestText(
    _systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    maxTokensOrOptions: number | TextGenerationOptions,
  ): Promise<string> {
    void maxTokensOrOptions;
    const last = [...messages].reverse().find((m) => m.role === 'user');
    return `Here is a concise tutor reply about: ${last?.content ?? 'your question'}.`;
  }

  async requestRaw(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
    if (userPrompt.includes('Generate only these slides')) {
      try {
        const match =
          userPrompt.match(/Generate only these slides:\n([\s\S]+?)\n\n(?:Return JSON|Rules:)/) ??
          userPrompt.match(/Generate only these slides:\n([\s\S]+?)\n\n/);
        if (match) {
          const slides = JSON.parse(match[1]) as Array<{ id: string; requiredType: string; title: string }>;
          const topic = userPrompt.match(/Lesson: ([^\n]+)/)?.[1] ?? 'Topic';
          const all = this.richCards(topic);
          const cards = slides.map((s) => all.find((c) => c.id === s.id) ?? {
            type: s.requiredType,
            id: s.id,
            title: s.title,
            body: `Content for ${s.title}`,
            ...(s.requiredType === 'application' || s.requiredType === 'misconception_check' || s.requiredType === 'quiz'
              ? {
                  question: `Check understanding of ${s.title}`,
                  options: ['Correct answer', 'Distractor A', 'Distractor B'],
                  answerIndex: 0,
                  explanation: 'Focus on the core mechanism.',
                }
              : {}),
          });
          return JSON.stringify(cards);
        }
      } catch {
        /* fall through */
      }
    }
    return this.requestJson(systemPrompt, userPrompt, maxTokens);
  }
}

export function createAiGenerationProvider(): AiGenerationProvider {
  if (process.env.MICROLEARN_AI_PROVIDER?.trim() === 'fake') {
    return new FakeDeterministicProvider();
  }
  return new OpenAiCompatibleProvider(loadProviderConfig());
}
