export interface ReviewSetCandidate {
  sourceRef: string;
  itemType:
    | 'concept_recall'
    | 'mcq'
    | 'cloze'
    | 'tiny_application'
    | 'mistake_check'
    | 'compare_contrast'
    | 'summary_recall';
  prompt: string;
  answer?: string;
  explanation?: string;
  concept?: string;
  difficulty?: number;
  choices?: string[];
  metadata?: Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function words(value: string): string[] {
  return value.match(/[A-Za-z][A-Za-z-]{2,}/g) ?? [];
}

function titleFromLesson(lesson: Record<string, unknown>): string {
  return text(lesson.title) || 'Lesson review';
}

function firstSentence(value: string): string {
  const [first] = value.split(/(?<=[.!?])\s+/);
  return (first || value).trim();
}

function makeCloze(sentence: string): { prompt: string; answer: string } | null {
  const candidates = words(sentence).filter((w) => w.length >= 5);
  const answer = candidates.sort((a, b) => b.length - a.length)[0];
  if (!answer) return null;
  return {
    prompt: sentence.replace(new RegExp(`\\b${answer}\\b`), '___'),
    answer,
  };
}

function cardId(card: Record<string, unknown>, index: number, lessonId: string): string {
  return text(card.id) || `${lessonId}#${index}`;
}

function pushUnique(out: ReviewSetCandidate[], candidate: ReviewSetCandidate): void {
  const key = `${candidate.itemType}:${candidate.prompt}`;
  if (out.some((item) => `${item.itemType}:${item.prompt}` === key)) return;
  out.push(candidate);
}

export function buildReviewSetCandidates(
  lessonId: string,
  lesson: Record<string, unknown>,
): { title: string; strategy: string; candidates: ReviewSetCandidate[] } {
  const cards = (lesson.cards ?? lesson.content) as unknown[];
  const title = titleFromLesson(lesson);
  const out: ReviewSetCandidate[] = [];
  if (!Array.isArray(cards)) return { title, strategy: 'mixed_adaptive_v1', candidates: out };

  cards.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const card = raw as Record<string, unknown>;
    const type = text(card.type);
    const id = cardId(card, index, lessonId);
    const source = (itemType: string) => ({
      sourceRef: `${id}#${itemType}`,
      metadata: { cardIndex: index, cardType: type },
    });

    if (type === 'quiz' || type === 'application' || type === 'prediction') {
      const question = text(card.question);
      const options = textArray(card.options);
      const answerIndex = Number(card.answerIndex);
      if (question && options.length >= 2 && Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length) {
        pushUnique(out, {
          ...source(type === 'quiz' ? 'mcq' : 'tiny_application'),
          itemType: type === 'quiz' ? 'mcq' : 'tiny_application',
          prompt: question,
          answer: options[answerIndex],
          explanation: text(card.explanation) || undefined,
          concept: question.slice(0, 120),
          choices: options,
          difficulty: type === 'quiz' ? 2 : 3,
        });
      }
      return;
    }

    if (type === 'misconception') {
      const question = text(card.question) || text(card.misconception);
      const options = textArray(card.options);
      const answerIndex = Number(card.answerIndex);
      if (question && options.length >= 2 && Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length) {
        pushUnique(out, {
          ...source('mistake_check'),
          itemType: 'mistake_check',
          prompt: question,
          answer: options[answerIndex],
          explanation: text(card.explanation) || undefined,
          concept: text(card.misconception) || question.slice(0, 120),
          choices: options,
          difficulty: 3,
        });
      }
      return;
    }

    if (type === 'truefalse') {
      const statement = text(card.statement);
      if (statement && typeof card.answer === 'boolean') {
        pushUnique(out, {
          ...source('mistake_check'),
          itemType: 'mistake_check',
          prompt: statement,
          answer: card.answer ? 'True' : 'False',
          explanation: text(card.explanation) || undefined,
          choices: ['True', 'False'],
          difficulty: 2,
        });
      }
      return;
    }

    const heading = text(card.keyTerm) || text(card.title);
    const body = text(card.keyTermDef) || text(card.body);
    if (heading && body) {
      pushUnique(out, {
        ...source('concept_recall'),
        itemType: 'concept_recall',
        prompt: `What is ${heading}?`,
        answer: firstSentence(body),
        explanation: body,
        concept: heading,
        difficulty: 2,
      });

      const cloze = makeCloze(firstSentence(body));
      if (cloze) {
        pushUnique(out, {
          ...source('cloze'),
          itemType: 'cloze',
          prompt: cloze.prompt,
          answer: cloze.answer,
          explanation: body,
          concept: heading,
          difficulty: 2,
        });
      }
    }

    if (type === 'summary') {
      const points = textArray(card.points);
      if (points.length > 0) {
        pushUnique(out, {
          ...source('summary_recall'),
          itemType: 'summary_recall',
          prompt: `Summarize the main takeaways from ${title}.`,
          answer: points.slice(0, 5).join('\n'),
          concept: title,
          difficulty: 2,
        });
      }
    }
  });

  const compareSource = out.find((item) => item.concept)?.concept;
  const compareTarget = out.find((item) => item.concept && item.concept !== compareSource)?.concept;
  if (compareSource && compareTarget) {
    pushUnique(out, {
      sourceRef: `${lessonId}#compare`,
      itemType: 'compare_contrast',
      prompt: `How are ${compareSource} and ${compareTarget} different?`,
      answer: 'Explain the key distinction in your own words.',
      concept: `${compareSource} vs ${compareTarget}`,
      difficulty: 3,
      metadata: { synthetic: true },
    });
  }

  const hasSummary = out.some((item) => item.itemType === 'summary_recall');
  if (!hasSummary && out.length >= 2) {
    pushUnique(out, {
      sourceRef: `${lessonId}#summary`,
      itemType: 'summary_recall',
      prompt: `What are the most important ideas from ${title}?`,
      answer: 'Recall 2-3 key ideas from the lesson.',
      concept: title,
      difficulty: 2,
      metadata: { synthetic: true },
    });
  }

  const target = Math.min(7, Math.max(3, Math.round(cards.length / 2)));
  const priority = ['mcq', 'mistake_check', 'concept_recall', 'cloze', 'tiny_application', 'compare_contrast', 'summary_recall'];
  const selected: ReviewSetCandidate[] = [];
  for (const kind of priority) {
    for (const item of out.filter((candidate) => candidate.itemType === kind)) {
      if (selected.length >= target) break;
      selected.push(item);
    }
  }

  return { title, strategy: 'mixed_adaptive_v1', candidates: selected };
}
