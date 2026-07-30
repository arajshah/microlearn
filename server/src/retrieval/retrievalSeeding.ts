export interface SeedCandidate {
  sourceRef: string;
  itemType: string;
  prompt: string;
  answer?: string;
  explanation?: string;
  concept?: string;
  difficulty?: number;
  metadata?: Record<string, unknown>;
}

function optionAnswer(options: string[], answerIndex: number): string | undefined {
  if (!Array.isArray(options) || answerIndex < 0 || answerIndex >= options.length) return undefined;
  return options[answerIndex];
}

/** Maps lesson card JSON into retrieval seed candidates. */
export function mapLessonCardsToSeedCandidates(
  lessonId: string,
  lesson: Record<string, unknown>,
): SeedCandidate[] {
  const cards = (lesson.cards ?? lesson.content) as unknown[];
  if (!Array.isArray(cards)) return [];

  const out: SeedCandidate[] = [];

  cards.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const card = raw as Record<string, unknown>;
    const type = String(card.type ?? 'unknown');
    const sourceRef = typeof card.id === 'string' ? card.id : `${lessonId}#${index}`;
    const base = { sourceRef, itemType: type, metadata: { cardIndex: index, cardType: type } };

    switch (type) {
      case 'quiz':
        out.push({
          ...base,
          prompt: String(card.question ?? 'Recall this question.'),
          answer: optionAnswer(card.options as string[], Number(card.answerIndex)),
          explanation: card.explanation ? String(card.explanation) : undefined,
          concept: String(card.question ?? '').slice(0, 120) || undefined,
          difficulty: 2,
        });
        break;
      case 'truefalse':
        out.push({
          ...base,
          prompt: String(card.statement ?? 'True or false?'),
          answer: card.answer === true ? 'True' : card.answer === false ? 'False' : undefined,
          explanation: card.explanation ? String(card.explanation) : undefined,
          difficulty: 2,
        });
        break;
      case 'fillblank':
        out.push({
          ...base,
          prompt: String(card.sentence ?? 'Fill in the blank.'),
          answer: optionAnswer(card.options as string[], Number(card.answerIndex)),
          explanation: card.explanation ? String(card.explanation) : undefined,
          difficulty: 2,
        });
        break;
      case 'recall':
        out.push({
          ...base,
          prompt: String(card.prompt ?? 'Recall from memory.'),
          answer: card.body ? String(card.body) : undefined,
          difficulty: 2,
        });
        break;
      case 'misconception':
        out.push({
          ...base,
          prompt: String(card.question ?? card.misconception ?? 'Identify the misconception.'),
          answer: optionAnswer(card.options as string[], Number(card.answerIndex)),
          explanation: card.explanation ? String(card.explanation) : undefined,
          concept: card.misconception ? String(card.misconception) : undefined,
          difficulty: 3,
        });
        break;
      case 'application':
      case 'prediction':
        out.push({
          ...base,
          prompt: String(card.question ?? card.scenario ?? 'Apply this concept.'),
          answer: optionAnswer(card.options as string[], Number(card.answerIndex)),
          explanation: card.explanation ? String(card.explanation) : undefined,
          difficulty: 3,
        });
        break;
      case 'summary': {
        const points = Array.isArray(card.points) ? card.points.filter((p) => typeof p === 'string') : [];
        out.push({
          ...base,
          prompt: `Summarize the key points${card.title ? ` of "${String(card.title)}"` : ''}.`,
          answer: points.slice(0, 5).join('\n') || undefined,
          concept: card.title ? String(card.title) : 'Summary',
          difficulty: 2,
        });
        break;
      }
      case 'concept':
        out.push({
          ...base,
          prompt: card.keyTerm
            ? `What is ${String(card.keyTerm)}?`
            : String(card.title ?? 'Explain this concept.'),
          answer: card.keyTermDef
            ? String(card.keyTermDef)
            : card.body
              ? String(card.body)
              : undefined,
          explanation: card.body ? String(card.body) : undefined,
          concept: card.keyTerm ? String(card.keyTerm) : card.title ? String(card.title) : undefined,
          difficulty: 2,
        });
        break;
      case 'explanation':
        out.push({
          ...base,
          prompt: card.keyTerm
            ? `Explain ${String(card.keyTerm)}.`
            : String(card.title ?? 'Explain this idea.'),
          answer: card.keyTermDef
            ? String(card.keyTermDef)
            : card.body
              ? String(card.body)
              : undefined,
          explanation: card.body ? String(card.body) : undefined,
          concept: card.keyTerm ? String(card.keyTerm) : card.title ? String(card.title) : undefined,
          difficulty: 2,
        });
        break;
      default:
        break;
    }
  });

  return out;
}
