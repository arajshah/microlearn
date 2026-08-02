import { LessonCard } from '@/types/content';

export function cardToTutorContext(card: LessonCard | null | undefined): string {
  if (!card || typeof card.type !== 'string') return '';

  switch (card.type) {
    case 'concept':
      return `${card.title}\n${card.body}${
        card.keyTerm ? `\nKey term — ${card.keyTerm}: ${card.keyTermDef ?? ''}` : ''
      }`;
    case 'quiz':
      return `Question: ${card.question}\nOptions: ${card.options.join(' | ')}\nCorrect: ${
        card.options[card.answerIndex]
      }\nWhy: ${card.explanation ?? ''}`;
    case 'truefalse':
      return `True/False: ${card.statement}\nAnswer: ${
        card.answer ? 'True' : 'False'
      }\nWhy: ${card.explanation ?? ''}`;
    case 'quote':
      return `Quote: "${card.text}" — ${card.author}`;
    case 'fillblank':
      return `Fill in the blank: ${card.sentence}\nAnswer: ${card.options[card.answerIndex]}`;
    case 'matching':
      return `Matching — ${card.prompt}: ${card.pairs.map((p) => `${p.left} → ${p.right}`).join('; ')}`;
    case 'ordering':
      return `Ordering — ${card.prompt}: ${card.items.join(' → ')}`;
    case 'flashcard':
      return `Flashcard — Front: ${card.front}\nBack: ${card.back}`;
    case 'code':
      return `Code (${card.language}): ${card.title}\n${card.code}${card.caption ? `\n${card.caption}` : ''}`;
    case 'hook':
    case 'explanation':
    case 'example':
      return `${card.title}\n${card.body}`;
    case 'recall':
      return `${card.prompt}\n${card.body}`;
    case 'summary':
      return card.points.join('\n');
    case 'next_connection':
      return card.nextTitle ? `Next: ${card.nextTitle}\n${card.body}` : card.body;
    case 'misconception':
    case 'application':
    case 'prediction':
      return `Question: ${card.question}\nOptions: ${card.options.join(' | ')}`;
    default:
      return '';
  }
}
