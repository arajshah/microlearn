import { LessonBlueprint } from '@/types/lessonBlueprint';
import { LessonGenerationContext } from '@/types/lessonGeneration';
import { LessonCard } from '@/types/content';
import { RoadmapLessonNode } from '@/types/roadmap';
import { BLUEPRINT_VERSION } from '@/types/lessonBlueprint';
import { repairLessonCards } from '@/utils/contentEngineV2';
import type { HeavyLessonChunk, HeavyLessonPlan } from '@/ai/heavyLessonGeneration';

const MATH_TOPIC =
  /fourier|probability|optimization|linear algebra|calculus|matrix|tensor|statistics|math|algebra|derivative|integral/i;

function isMathTopic(title: string, ctx: LessonGenerationContext): boolean {
  return MATH_TOPIC.test(`${title} ${ctx.roadmapTitle} ${ctx.currentLessonTitle}`);
}

export function buildFallbackBlueprint(
  ctx: LessonGenerationContext,
  node: RoadmapLessonNode,
): LessonBlueprint {
  const keyIdeas = node.keyIdeas.length > 0 ? node.keyIdeas : [node.learningObjective || node.title];
  return {
    id: `fallback-${ctx.roadmapId}-${node.id}`,
    roadmapId: ctx.roadmapId,
    roadmapNodeId: node.id,
    version: BLUEPRINT_VERSION,
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
    estimatedMinutes: Math.min(8, Math.max(3, node.estimatedMinutes || 5)),
    createdAt: new Date().toISOString(),
    coreMentalModel: `Think of ${node.title} as a building block toward ${ctx.roadmapGoal}.`,
    workedExamplePlan: `Walk through one concrete ${node.title} example step by step.`,
    visualModel: `Picture how ${node.title} fits into the bigger roadmap.`,
    misconceptionTargets: [`Confusing ${node.title} with unrelated concepts.`],
    nextBridge: ctx.upcomingLessons[0]?.title,
  };
}

export function buildFallbackCards(
  ctx: LessonGenerationContext,
  node: RoadmapLessonNode,
  blueprint: LessonBlueprint,
): LessonCard[] {
  const ideas = blueprint.keyIdeas.length > 0 ? blueprint.keyIdeas : [blueprint.primaryObjective];
  const math = isMathTopic(node.title, ctx);

  const cards: LessonCard[] = [
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
        : 'This is an early lesson in the path, so focus on the core vocabulary.',
    },
    {
      type: 'visual_model',
      id: 'c3',
      title: 'Picture the idea',
      visualDescription:
        blueprint.visualModel ??
        `Flow from prerequisites into ${node.title}.`,
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'n1', label: 'Prerequisites' },
          { id: 'n2', label: node.title },
          { id: 'n3', label: 'Application' },
        ],
        edges: [
          { from: 'n1', to: 'n2' },
          { from: 'n2', to: 'n3' },
        ],
      },
      body: blueprint.coreMentalModel ?? `Build intuition for ${node.title} before details.`,
      takeaway: 'A clear mental picture makes the formal details easier to remember.',
    },
  ];

  if (math) {
    cards.push({
      type: 'formula',
      id: 'c4',
      title: `${node.title} in symbols`,
      formula: 'f(x) → y',
      plainEnglish: `This stands for how ${node.title} maps inputs to meaningful outputs in this topic.`,
      notation: [{ symbol: 'x', meaning: 'input or context' }, { symbol: 'y', meaning: 'result or insight' }],
      body: blueprint.formalDefinition,
    });
  } else {
    cards.push({
      type: 'explanation',
      id: 'c4',
      title: ideas[0] ?? node.title,
      body: `${ideas[0] ?? node.title} is central to ${node.title}. ${blueprint.primaryObjective}`,
    });
  }

  cards.push(
    {
      type: 'worked_example',
      id: 'c5',
      title: 'Walk through an example',
      problem: `Apply ${node.title} to a simple case tied to the roadmap goal.`,
      steps: [
        {
          label: 'Setup',
          work: 'Identify the given information.',
          explanation: 'Start by naming what you know and what you need.',
        },
        {
          label: 'Apply',
          work: 'Use the core idea from this lesson.',
          explanation: blueprint.primaryObjective,
        },
      ],
      answer: 'A result that matches the lesson objective.',
      insight: 'Good examples connect abstract ideas to concrete outcomes.',
    },
    {
      type: 'misconception_check',
      id: 'c6',
      misconception:
        blueprint.misconceptionTargets?.[0] ??
        `Treating ${node.title} as unrelated to the rest of the roadmap.`,
      question: `Which statement best matches the purpose of ${node.title}?`,
      options: [
        blueprint.primaryObjective,
        'Memorize unrelated terminology without using it.',
        'Skip prerequisite ideas and jump ahead randomly.',
        'Avoid connecting this lesson to the rest of the path.',
      ],
      answerIndex: 0,
      explanation: 'The lesson should stay anchored to its stated objective and roadmap context.',
    },
    {
      type: 'application',
      id: 'c7',
      question: `How would you use ${node.title} in practice?`,
      options: [
        'Connect it to a real example from the roadmap goal',
        'Ignore it after reading once',
        'Use it only as vocabulary with no application',
        'Replace it with an unrelated shortcut',
      ],
      answerIndex: 0,
      explanation: 'Application means transferring the idea to a meaningful context.',
    },
    {
      type: 'summary',
      id: 'c8',
      title: 'What to remember',
      points: ideas.slice(0, 4),
    },
    {
      type: 'next_connection',
      id: 'c9',
      body: ctx.upcomingLessons[0]
        ? `Next, this prepares you for ${ctx.upcomingLessons[0].title}.`
        : 'This closes the loop for the current roadmap sequence.',
      nextTitle: ctx.upcomingLessons[0]?.title,
    },
  );

  return repairLessonCards(cards);
}

function fallbackCardForType(
  type: string,
  id: string,
  title: string,
  ctx: LessonGenerationContext,
): LessonCard {
  switch (type) {
    case 'formula':
      return {
        type: 'formula',
        id,
        title,
        formula: 'input -> transformation -> output',
        plainEnglish: `Use ${title} to see how one representation changes into another.`,
        notation: [
          { symbol: 'input', meaning: 'what you start with' },
          { symbol: 'output', meaning: 'what the idea helps you understand' },
        ],
      };
    case 'derivation':
      return {
        type: 'derivation',
        id,
        title,
        setup: `Start from the objective: ${ctx.currentLearningObjective}.`,
        steps: [
          { label: 'Name the knowns', expression: 'knowns -> goal', explanation: 'Identify the pieces already available.' },
          { label: 'Apply the idea', expression: 'goal = method(knowns)', explanation: `Use ${ctx.currentLessonTitle} as the method.` },
        ],
        conclusion: `The derivation shows why ${ctx.currentLessonTitle} supports the roadmap goal.`,
      };
    case 'worked_example':
      return {
        type: 'worked_example',
        id,
        title,
        problem: `Work through a small example of ${ctx.currentLessonTitle}.`,
        steps: [
          { label: 'Setup', work: 'List the given information.', explanation: 'A clear setup prevents guessing.' },
          { label: 'Solve', work: 'Apply the core idea.', explanation: ctx.currentLearningObjective },
        ],
        answer: 'The result follows from applying the lesson objective.',
        insight: 'The example turns the abstract idea into a repeatable move.',
      };
    case 'misconception_check':
      return {
        type: 'misconception_check',
        id,
        misconception: `Thinking ${ctx.currentLessonTitle} is only a definition to memorize.`,
        question: `What is the best way to use ${ctx.currentLessonTitle}?`,
        options: [
          'Apply it to explain or solve a concrete case',
          'Memorize the words and stop there',
          'Ignore prerequisite ideas',
          'Treat it as unrelated to the roadmap',
        ],
        answerIndex: 0,
        explanation: 'The goal is usable understanding, not isolated vocabulary.',
      };
    case 'compare_contrast':
      return {
        type: 'compare_contrast',
        id,
        title,
        leftLabel: 'Surface view',
        rightLabel: 'Useful view',
        points: [
          { left: 'Memorize terms', right: 'Connect terms to actions' },
          { left: 'See this lesson alone', right: 'Use it as part of the roadmap' },
        ],
        takeaway: 'The useful view explains when and why the idea matters.',
      };
    case 'visual_model':
      return {
        type: 'visual_model',
        id,
        title,
        visualDescription: `Flow from prior knowledge into ${ctx.currentLessonTitle}.`,
        diagram: {
          kind: 'flow',
          nodes: [
            { id: 'n1', label: 'Prior knowledge' },
            { id: 'n2', label: ctx.currentLessonTitle },
            { id: 'n3', label: ctx.upcomingLessons[0]?.title ?? 'Next step' },
          ],
          edges: [
            { from: 'n1', to: 'n2' },
            { from: 'n2', to: 'n3' },
          ],
        },
        body: `${ctx.currentLessonTitle} works best when you see where it sits in the larger path.`,
        takeaway: 'Mental structure makes recall and transfer easier.',
      };
    case 'summary':
      return {
        type: 'summary',
        id,
        title: 'What to remember',
        points: [ctx.currentLearningObjective, `Use ${ctx.currentLessonTitle} in context.`],
      };
    case 'next_connection':
      return {
        type: 'next_connection',
        id,
        body: ctx.upcomingLessons[0]
          ? `Next, this prepares you for ${ctx.upcomingLessons[0].title}.`
          : 'This completes the current step in the roadmap.',
        nextTitle: ctx.upcomingLessons[0]?.title,
      };
    case 'application':
    case 'quiz':
      return {
        type: 'application',
        id,
        question: `Which move best applies ${ctx.currentLessonTitle}?`,
        options: [
          'Use the core idea on a concrete example',
          'Skip the example',
          'Avoid checking assumptions',
          'Use an unrelated shortcut',
        ],
        answerIndex: 0,
        explanation: 'Application means using the idea, not just naming it.',
      };
    case 'hook':
      return {
        type: 'hook',
        id,
        title,
        body: `${ctx.currentLessonTitle} matters because it helps with ${ctx.roadmapGoal}.`,
      };
    case 'recall':
      return {
        type: 'recall',
        id,
        prompt: title,
        body: ctx.prerequisiteLessons[0]?.objective ?? 'Recall the key setup before continuing.',
      };
    default:
      return {
        type: 'explanation',
        id,
        title,
        body: `${title}: ${ctx.currentLearningObjective}`,
      };
  }
}

export function buildFallbackCardsForPlanChunk(
  ctx: LessonGenerationContext,
  plan: HeavyLessonPlan,
  chunk: HeavyLessonChunk,
): LessonCard[] {
  const cards = chunk.slides.map((slide) =>
    fallbackCardForType(
      slide.requiredType,
      slide.id || `c${slide.index}`,
      slide.title || `${plan.title} ${slide.index}`,
      ctx,
    ),
  );
  return repairLessonCards(cards, chunk.slides.length);
}
