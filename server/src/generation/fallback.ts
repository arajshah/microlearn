import type {
  CardRecord,
  HeavyLessonChunk,
  HeavyLessonPlan,
  LessonBlueprint,
  LessonGenerationContext,
} from './types';
import { BLUEPRINT_SCHEMA_VERSION } from './versions';
import { isMathHeavy } from './strategy';
import { SUPPORTED_CARD_TYPES } from './cards';

const MATH_TOPIC =
  /fourier|probability|optimization|linear algebra|calculus|matrix|tensor|statistics|math|algebra|derivative|integral|attention|transformer|gradient|neural/i;

function isMathTopic(title: string, ctx: LessonGenerationContext): boolean {
  return MATH_TOPIC.test(`${title} ${ctx.roadmapTitle} ${ctx.currentLessonTitle}`) || isMathHeavy('', title);
}

export function buildFallbackBlueprint(
  ctx: LessonGenerationContext,
  node: {
    id: string;
    title: string;
    learningObjective: string;
    keyIdeas: string[];
    estimatedMinutes: number;
  },
): LessonBlueprint {
  const keyIdeas = node.keyIdeas.length > 0 ? node.keyIdeas : [node.learningObjective || node.title];
  return {
    id: `fallback-${ctx.roadmapId}-${node.id}`,
    roadmapId: ctx.roadmapId,
    roadmapNodeId: node.id,
    version: BLUEPRINT_SCHEMA_VERSION,
    title: node.title,
    primaryObjective: node.learningObjective || `Understand ${node.title}.`,
    prerequisiteRecall: ctx.prerequisiteLessons.slice(0, 2).map((l) => l.objective),
    keyIdeas,
    explanationPlan: keyIdeas.map((idea) => `Explain ${idea}.`).slice(0, 4),
    examplePlan: [`Use a concrete example to connect ${node.title} to the roadmap goal.`],
    interactionPlan: [
      { type: 'multiple_choice', purpose: 'Check the core idea.', conceptTested: keyIdeas[0] },
      {
        type: 'true_false',
        purpose: 'Check conceptual precision.',
        conceptTested: keyIdeas[1] ?? keyIdeas[0],
      },
    ],
    misconceptionChecks: [
      {
        misconception: `Treating ${node.title} as unrelated to the roadmap goal.`,
        diagnosticQuestion: `Which statement best reflects the purpose of ${node.title}?`,
        correctionGoal: 'Anchor the lesson to its objective.',
      },
    ],
    applicationPlan: [`Apply ${node.title} to a small example.`],
    summaryPoints: keyIdeas.slice(0, 4),
    previousLessonConnection: ctx.prerequisiteLessons[0]?.title,
    nextLessonConnection: ctx.upcomingLessons[0]?.title,
    estimatedMinutes: Math.min(12, Math.max(3, node.estimatedMinutes || 5)),
    createdAt: new Date().toISOString(),
    coreMentalModel: `Think of ${node.title} as a building block toward ${ctx.roadmapGoal}.`,
    workedExamplePlan: `Walk through one concrete ${node.title} example step by step.`,
    visualModel: `Picture how ${node.title} fits into the bigger roadmap.`,
    misconceptionTargets: [`Confusing ${node.title} with unrelated concepts.`],
    nextBridge: ctx.upcomingLessons[0]?.title,
  };
}

export function buildFallbackCardsForPlanChunk(
  ctx: LessonGenerationContext,
  plan: HeavyLessonPlan,
  chunk: HeavyLessonChunk,
): CardRecord[] {
  const math = isMathTopic(plan.title, ctx);
  return chunk.slides.map((slide) => {
    if (slide.requiredType === 'hook') {
      return {
        type: 'hook',
        id: slide.id,
        title: slide.title,
        body: `This slide introduces ${slide.keyIdea}.`,
      };
    }
    if (slide.requiredType === 'formula' && math) {
      return {
        type: 'formula',
        id: slide.id,
        title: slide.title,
        formula: 'f(x) → y',
        plainEnglish: slide.purpose,
        body: slide.keyIdea,
      };
    }
    if (slide.requiredType === 'worked_example') {
      return {
        type: 'worked_example',
        id: slide.id,
        title: slide.title,
        problem: slide.keyIdea,
        steps: [{ label: 'Step 1', work: slide.purpose, explanation: slide.keyIdea }],
        answer: slide.keyIdea,
        insight: slide.purpose,
      };
    }
    if (slide.requiredType === 'misconception_check') {
      return {
        type: 'misconception_check',
        id: slide.id,
        misconception: `Common confusion about ${slide.title}`,
        question: `Which statement about ${slide.title} is most accurate?`,
        options: ['Option A', 'Option B', 'Option C'],
        answerIndex: 0,
        explanation: slide.purpose,
      };
    }
    if (slide.requiredType === 'quiz' || slide.requiredType === 'application') {
      return {
        type: slide.requiredType,
        id: slide.id,
        question: slide.title,
        options: ['A', 'B', 'C', 'D'],
        answerIndex: 0,
        explanation: slide.purpose,
      };
    }
    if (slide.requiredType === 'summary') {
      return {
        type: 'summary',
        id: slide.id,
        title: slide.title,
        points: [slide.keyIdea, slide.purpose],
      };
    }
    if (slide.requiredType === 'next_connection') {
      return {
        type: 'next_connection',
        id: slide.id,
        body: slide.purpose,
        nextTitle: ctx.upcomingLessons[0]?.title,
      };
    }
    return {
      type: SUPPORTED_CARD_TYPES.includes(slide.requiredType as never) ? slide.requiredType : 'explanation',
      id: slide.id,
      title: slide.title,
      body: `${slide.purpose}\n\n${slide.keyIdea}`,
    };
  });
}

export function buildFallbackCards(
  ctx: LessonGenerationContext,
  node: { title: string },
  blueprint: LessonBlueprint,
): CardRecord[] {
  const ideas = blueprint.keyIdeas.length > 0 ? blueprint.keyIdeas : [blueprint.primaryObjective];
  const math = isMathTopic(node.title, ctx);
  const cards: CardRecord[] = [
    {
      type: 'hook',
      id: 'c1',
      title: node.title,
      body: `This lesson focuses on one objective: ${blueprint.primaryObjective}`,
    },
    {
      type: 'recall',
      id: 'c2',
      prompt: 'Before learning this, recall the setup.',
      body: ctx.prerequisiteLessons[0]
        ? `${ctx.prerequisiteLessons[0].title}: ${ctx.prerequisiteLessons[0].objective}`
        : 'Focus on the core vocabulary for this lesson.',
    },
    {
      type: 'explanation',
      id: 'c3',
      title: ideas[0],
      body: blueprint.explanationPlan[0] ?? `Explain ${ideas[0]}.`,
    },
  ];
  if (math) {
    cards.push({
      type: 'formula',
      id: 'c4',
      title: `${node.title} in symbols`,
      formula: 'f(x) → y',
      plainEnglish: `How ${node.title} maps inputs to outputs.`,
      body: blueprint.formalDefinition,
    });
  }
  cards.push(
    {
      type: 'worked_example',
      id: 'c5',
      title: 'Worked example',
      problem: blueprint.examplePlan[0] ?? `Apply ${node.title}.`,
      steps: [{ label: 'Step 1', work: 'Setup', explanation: ideas[0] }],
      answer: ideas[0],
      insight: blueprint.coreMentalModel ?? '',
    },
    {
      type: 'misconception_check',
      id: 'c6',
      misconception: blueprint.misconceptionChecks[0]?.misconception ?? `Confusion about ${node.title}`,
      question: blueprint.misconceptionChecks[0]?.diagnosticQuestion ?? `What is the core idea of ${node.title}?`,
      options: ['Correct framing', 'Common mistake', 'Unrelated detail'],
      answerIndex: 0,
      explanation: blueprint.misconceptionChecks[0]?.correctionGoal ?? 'Focus on the objective.',
    },
    {
      type: 'application',
      id: 'c7',
      question: blueprint.applicationPlan[0] ?? `How would you apply ${node.title}?`,
      options: ['Approach A', 'Approach B', 'Approach C'],
      answerIndex: 0,
      explanation: 'Choose the approach aligned with the lesson objective.',
    },
    {
      type: 'summary',
      id: 'c8',
      title: 'Summary',
      points: blueprint.summaryPoints.slice(0, 4),
    },
  );
  if (ctx.upcomingLessons.length > 0) {
    cards.push({
      type: 'next_connection',
      id: 'c9',
      body: blueprint.nextLessonConnection ?? `Next: ${ctx.upcomingLessons[0].title}`,
      nextTitle: ctx.upcomingLessons[0].title,
    });
  }
  return cards;
}
