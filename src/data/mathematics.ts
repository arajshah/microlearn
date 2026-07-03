import { Subject } from '@/types/content';

export const mathematics: Subject = {
  id: 'mathematics',
  title: 'Mathematics',
  tagline: 'Patterns, proof, and problem-solving',
  description:
    'Build intuition for algebra, probability, and logic — the language behind science, finance, and code.',
  icon: 'calculator',
  gradient: ['#2980B9', '#1A5276'],
  accent: '#5DADE2',
  units: [
    {
      id: 'math-u1',
      title: 'Numbers & Logic',
      description: 'Sets, proofs, and basic algebra.',
      difficulty: 'beginner',
      lessons: [
        {
          id: 'math-l1',
          title: 'Variables & Equations',
          subtitle: 'Letters that stand for numbers',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '𝑥',
              title: 'Algebra is generalized arithmetic',
              body: 'Variables represent unknown or changing quantities. An equation states two expressions are equal; solving means finding values that make it true. Same rules as arithmetic — balance both sides.',
              keyTerm: 'Linear equation',
              keyTermDef: 'Equation where the variable appears to the first power only.',
            },
            {
              type: 'code',
              title: 'Balance both sides',
              language: 'math',
              code: '2x + 3 = 11\n2x = 8      (subtract 3)\nx = 4       (divide by 2)',
              caption: 'Each step applies the same operation to both sides.',
            },
            {
              type: 'quiz',
              question: 'Solve: 3x − 5 = 10',
              options: ['x = 3', 'x = 5', 'x = 15', 'x = 5/3'],
              answerIndex: 1,
              explanation: '3x = 15, so x = 5.',
            },
          ],
        },
        {
          id: 'math-l2',
          title: 'Logic & Sets',
          subtitle: 'If… then, and, or',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '∧',
              title: 'Propositions and connectives',
              body: 'Logic studies statements that are true or false. AND (∧), OR (∨), and NOT (¬) combine them. An implication "P → Q" is false only when P is true and Q is false.',
            },
            {
              type: 'fillblank',
              sentence: 'The statement "P AND Q" is true only when ___',
              options: [
                'both P and Q are true',
                'either P or Q is true',
                'P is false',
                'Q is false',
              ],
              answerIndex: 0,
              explanation: 'Conjunction requires both parts to hold.',
            },
            {
              type: 'truefalse',
              statement: 'Every set is a subset of itself.',
              answer: true,
              explanation: 'A ⊆ A always — reflexivity of subset relation.',
            },
          ],
        },
      ],
    },
    {
      id: 'math-u2',
      title: 'Probability',
      description: 'Uncertainty, odds, and Bayes.',
      difficulty: 'intermediate',
      prerequisites: ['math-u1'],
      lessons: [
        {
          id: 'math-l3',
          title: 'Probability Basics',
          subtitle: 'From coins to sample spaces',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '🎲',
              title: 'Sample spaces',
              body: 'Probability assigns a number between 0 and 1 to outcomes. The sample space is all possible outcomes; probabilities of mutually exclusive outcomes add. P(not A) = 1 − P(A).',
              keyTerm: 'Independent events',
              keyTermDef: 'Events where one outcome does not change the probability of the other.',
            },
            {
              type: 'quiz',
              question: 'A fair coin is flipped twice. P(both heads)?',
              options: ['1/2', '1/3', '1/4', '1/8'],
              answerIndex: 2,
              explanation: 'P(H) × P(H) = 1/2 × 1/2 = 1/4 for independent flips.',
            },
            {
              type: 'flashcard',
              front: 'Law of large numbers',
              back: 'As trials increase, the observed frequency tends toward the true probability.',
            },
          ],
        },
        {
          id: 'math-l4',
          title: 'Bayes\' Theorem',
          subtitle: 'Updating beliefs with evidence',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '🔄',
              title: 'Prior → posterior',
              body: 'Bayes\' theorem tells you how to update P(hypothesis | evidence) using P(evidence | hypothesis), the prior, and P(evidence). It underlies medical testing, spam filters, and rational belief revision.',
              keyTerm: 'Bayes\' theorem',
              keyTermDef: 'P(A|B) = P(B|A)P(A) / P(B)',
            },
            {
              type: 'code',
              title: 'Bayes formula',
              language: 'math',
              code: 'P(A|B) = P(B|A) × P(A) / P(B)\n\nExample: rare disease test\nPrior P(disease) = 0.01\nSensitivity P(+|disease) = 0.99',
              caption: 'A positive test still may mean low P(disease) if the disease is rare.',
            },
            {
              type: 'truefalse',
              statement: 'A 99% accurate test always means a positive result implies 99% chance of disease.',
              answer: false,
              explanation: 'Base rates matter — for rare diseases, many false positives occur among healthy people.',
            },
          ],
        },
      ],
    },
    {
      id: 'math-u3',
      title: 'Functions & Growth',
      description: 'Exponentials, logarithms, and rates of change.',
      difficulty: 'advanced',
      prerequisites: ['math-u2'],
      lessons: [
        {
          id: 'math-l5',
          title: 'Exponential Growth',
          subtitle: 'Doubling and compound interest',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '📈',
              title: 'Growth proportional to size',
              body: 'Exponential functions f(t) = a·b^t grow by a constant factor each step. Compound interest, population growth, and viral spread often approximate exponentials — until limits kick in.',
            },
            {
              type: 'ordering',
              prompt: 'Order the steps to compute compound interest A = P(1+r)^t.',
              items: [
                'Identify principal P, rate r, and time t',
                'Compute the growth factor (1 + r)',
                'Raise the growth factor to the power t',
                'Multiply by P to get amount A',
              ],
              explanation: 'Compound interest applies the growth factor repeatedly, then scales by principal.',
            },
            {
              type: 'quiz',
              question: '$1000 at 5% annual compound interest for 2 years (no withdrawals) is closest to:',
              options: ['$1050', '$1100', '$1102.50', '$1200'],
              answerIndex: 2,
              explanation: '1000 × 1.05² = 1102.50.',
            },
          ],
        },
        {
          id: 'math-l6',
          title: 'Logarithms',
          subtitle: 'Inverse of exponentiation',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: 'log',
              title: 'What power gives this?',
              body: 'log_b(x) = y means b^y = x. Logarithms turn multiplication into addition — why they appear in decibels, pH, and algorithm complexity (O(log n)).',
              keyTerm: 'Natural log (ln)',
              keyTermDef: 'Logarithm base e ≈ 2.718.',
            },
            {
              type: 'fillblank',
              sentence: 'log₁₀(1000) = ___',
              options: ['3', '10', '100', '30'],
              answerIndex: 0,
              explanation: '10³ = 1000, so log₁₀(1000) = 3.',
            },
            {
              type: 'code',
              title: 'Log in Big-O',
              language: 'text',
              code: 'Binary search: O(log n)\nEach step halves the search space.\nn = 1,000,000 → ~20 steps',
              caption: 'Logarithmic algorithms scale well to huge inputs.',
            },
          ],
        },
      ],
    },
  ],
};
