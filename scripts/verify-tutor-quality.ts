#!/usr/bin/env npx tsx
/**
 * Verifies tutor reply sanitization and client formatting without real AI calls.
 */
import {
  sanitizeTutorReply,
  TUTOR_EMPTY_FALLBACK,
} from '../server/src/generation/tutorReplySanitizer';
import { extractAssistantVisibleContent } from '../server/src/generation/provider';
import { formatTutorReply } from '../src/components/tutor/formatTutorReply';

function check(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`  ✓ ${name}`);
}

function main(): void {
  console.log('verify-tutor-quality');

  // --- Hidden reasoning tags ---
  {
    const r = sanitizeTutorReply('<think>hidden reasoning</think>\nActual answer');
    check('strips <think> blocks', r.ok && r.text === 'Actual answer');
  }
  {
    const r = sanitizeTutorReply('<analysis>private notes</analysis>\nHere is the lesson point.');
    check('strips <analysis> blocks', r.ok && r.text.includes('lesson point') && !r.text.includes('private'));
  }

  // --- Meta labels + final answer ---
  {
    const r = sanitizeTutorReply('Analysis: long private chain\nFinal answer: Photosynthesis converts light to chemical energy.');
    check(
      'keeps final answer after analysis',
      r.ok &&
        r.text.includes('Photosynthesis') &&
        !/^analysis/i.test(r.text) &&
        !/final answer/i.test(r.text),
    );
  }
  {
    const r = sanitizeTutorReply('Reasoning: I should explain carefully.\nGravity pulls objects together.');
    check(
      'strips reasoning label without final-answer label',
      r.ok && r.text.includes('Gravity') && !/^reasoning/i.test(r.text),
    );
  }

  // --- Duplicates ---
  {
    const r = sanitizeTutorReply('Same paragraph here.\n\nSame paragraph here.\n\nNext idea.');
    check('removes adjacent duplicate paragraphs', r.ok && (r.text.match(/Same paragraph here/g) ?? []).length === 1);
  }
  {
    const r = sanitizeTutorReply('The mitochondria is the powerhouse. The mitochondria is the powerhouse. Remember that.');
    check(
      'removes adjacent duplicate sentences',
      r.ok && (r.text.match(/mitochondria is the powerhouse/gi) ?? []).length === 1,
    );
  }

  // --- Punctuation / dashes ---
  {
    const r = sanitizeTutorReply('Wow!!! Really??? Wait...... done.');
    check('normalizes repeated punctuation', r.ok && !r.text.includes('!!!') && !r.text.includes('???') && !r.text.includes('......'));
  }
  {
    const r = sanitizeTutorReply('Use an em dash — like this – and minus − too.');
    check('normalizes unicode dashes in prose', r.ok && !r.text.includes('—') && !r.text.includes('–') && r.text.includes('-'));
  }

  // --- Preserve code, formulas, decimals, legitimate "analysis" ---
  {
    const code = '```js\nconst x = 1;\n```\nThe function returns 1.';
    const r = sanitizeTutorReply(code);
    check('preserves fenced code blocks', r.ok && r.text.includes('```js') && r.text.includes('const x = 1;'));
  }
  {
    const r = sanitizeTutorReply('Energy is E = mc^2 when mass is 2.5 kg.');
    check('preserves formulas and decimals', r.ok && r.text.includes('mc^2') && r.text.includes('2.5'));
  }
  {
    const r = sanitizeTutorReply('Statistical analysis shows the sample mean converges.');
    check('preserves legitimate use of the word analysis', r.ok && r.text.toLowerCase().includes('statistical analysis'));
  }

  // --- Empty / reasoning-only ---
  {
    const r = sanitizeTutorReply('');
    check('rejects empty provider output', !r.ok && r.text === TUTOR_EMPTY_FALLBACK && r.reason === 'empty');
  }
  {
    const r = sanitizeTutorReply('<think>only hidden stuff</think>');
    check(
      'rejects reasoning-only output',
      !r.ok && r.text === TUTOR_EMPTY_FALLBACK,
    );
  }

  // --- Provider visible content extraction ---
  {
    const content = extractAssistantVisibleContent({
      choices: [
        {
          message: {
            content: 'Visible answer',
            reasoning: 'secret chain',
            reasoning_content: 'more secret',
          },
          reasoning: 'also secret',
        },
      ],
    });
    check('ignores provider reasoning fields', content === 'Visible answer');
  }

  // --- Client formatter ---
  {
    const blocks = formatTutorReply(
      'Hello there\nthis continues on the next soft-wrapped line.\n\n• One\n• Two\n\n1. First\n2. Second',
    );
    check(
      'joins soft-wrapped lines into paragraphs',
      blocks.some(
        (b) => b.type === 'paragraph' && b.text.includes('Hello there this continues on the next'),
      ),
    );
    check(
      'renders bullets',
      blocks.filter((b) => b.type === 'bullet').length === 2,
    );
    check(
      'renders numbered steps',
      blocks.filter((b) => b.type === 'numbered').length === 2,
    );
  }
  {
    const blocks = formatTutorReply('Intro\n```ts\nconst a = 1;\n```\nOutro');
    check(
      'preserves code blocks in formatter',
      blocks.some((b) => b.type === 'code' && b.text.includes('const a = 1')),
    );
  }
  {
    const blocks = formatTutorReply('One sentence only.');
    check(
      'does not split a single sentence into many nodes',
      blocks.length === 1 && blocks[0]?.type === 'paragraph',
    );
  }

  console.log('verify-tutor-quality: all checks passed');
}

main();
