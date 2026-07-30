#!/usr/bin/env npx tsx
import { diagramFromDescription, parseDiagramJson, resolveLessonDiagram } from '@/utils/diagramFromDescription';
import { hasMathDelimiters, splitMathSegments } from '@/utils/mathSegments';
import { latexToPlainText, latexToTokens } from '@/utils/latexDisplay';
import { parseMarkdownBlocks, parseInlineSegments } from '@/utils/markdownBlocks';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// --- Math ---
const inline = splitMathSegments('Energy is $E = mc^2$ in physics.');
assert(inline.some((s) => s.type === 'math' && s.content.includes('E')), 'inline math split failed');

const block = splitMathSegments('$$y = mx + b$$');
assert(block.length === 1 && block[0].type === 'math' && block[0].block, 'block math split failed');

assert(hasMathDelimiters('$x$'), 'hasMathDelimiters inline');
assert(hasMathDelimiters('$$x$$'), 'hasMathDelimiters block');

const tokens = latexToTokens('E = mc^2');
assert(tokens.length > 0, 'latex tokens empty');
assert(!latexToPlainText('$$\\frac{1}{2}$$').includes('$$'), 'latex plain should strip delimiters');

// --- Markdown ---
const blocks = parseMarkdownBlocks('## Heading\n\n**Bold** and *italic*\n\n- one\n- two');
assert(blocks.some((b) => b.type === 'heading'), 'markdown heading');
assert(blocks.some((b) => b.type === 'bullet'), 'markdown bullets');

const inlineSeg = parseInlineSegments('**bold** text');
assert(inlineSeg.some((s) => s.styles.includes('bold')), 'inline bold');

// --- Diagrams ---
const flowJson = parseDiagramJson({
  kind: 'flow',
  nodes: [
    { id: 'a', label: 'Start' },
    { id: 'b', label: 'End' },
  ],
  edges: [{ from: 'a', to: 'b' }],
});
assert(flowJson?.kind === 'flow' && (flowJson.nodes?.length ?? 0) === 2, 'diagram json parse');

const proseDiagram = diagramFromDescription(
  'A split-screen diagram. The left side shows old method. The right side shows new method.',
);
assert(proseDiagram?.kind === 'split', 'prose split diagram');
assert((proseDiagram?.leftItems?.length ?? 0) > 0, 'split left items');

const flowProse = diagramFromDescription(
  'A simple flow diagram: input then transform then output.',
);
assert(flowProse?.kind === 'flow', 'prose flow diagram');
assert((flowProse?.nodes?.length ?? 0) >= 2, 'flow nodes');

const resolved = resolveLessonDiagram(
  { kind: 'timeline', steps: ['A', 'B', 'C'] },
  'ignored prose',
);
assert(resolved?.kind === 'timeline' && resolved.steps?.length === 3, 'resolve prefers diagram field');

// --- Navigation logic (pure) ---
function canGoBack(index: number): boolean {
  return index > 0;
}
function forwardLabel(index: number, total: number, isQuestion: boolean, revealed: boolean): string {
  if (index >= total - 1) return 'Finish lesson';
  if (isQuestion && !revealed) return 'Select an answer';
  return 'Forward';
}

assert(!canGoBack(0), 'first slide cannot go back');
assert(canGoBack(1), 'second slide can go back');
assert(forwardLabel(0, 5, false, false) === 'Forward', 'forward label mid lesson');
assert(forwardLabel(4, 5, false, false) === 'Finish lesson', 'finish on last slide');
assert(forwardLabel(2, 5, true, false) === 'Select an answer', 'quiz unrevealed');

console.log('Lesson rendering verification passed.');
