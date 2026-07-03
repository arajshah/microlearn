import { Subject } from '@/types/content';

export const psychology: Subject = {
  id: 'psychology',
  title: 'Psychology',
  tagline: 'Understand minds — yours and others',
  description:
    'Explore how we think, feel, learn, and decide. From classic experiments to cognitive biases and mental health basics.',
  icon: 'heart',
  gradient: ['#9B59B6', '#6C3483'],
  accent: '#C39BD3',
  units: [
    {
      id: 'psy-u1',
      title: 'How We Learn',
      description: 'Behavior, conditioning, and memory.',
      difficulty: 'beginner',
      lessons: [
        {
          id: 'psy-l1',
          title: 'Classical Conditioning',
          subtitle: 'Pavlov and learned associations',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🔔',
              title: 'Learning by association',
              body: 'Classical conditioning pairs a neutral stimulus with one that naturally triggers a response — until the neutral stimulus alone triggers it. Pavlov\'s dogs salivating to a bell is the classic example.',
              keyTerm: 'Classical conditioning',
              keyTermDef: 'Learning in which a neutral stimulus becomes associated with a reflex.',
            },
            {
              type: 'matching',
              prompt: 'Match conditioning terms to definitions.',
              pairs: [
                { left: 'Unconditioned stimulus', right: 'Naturally triggers a response' },
                { left: 'Conditioned stimulus', right: 'Previously neutral; now triggers response' },
                { left: 'Extinction', right: 'CS presented without US; response fades' },
              ],
              explanation: 'US = unconditioned stimulus; CS = conditioned stimulus after training.',
            },
            {
              type: 'quiz',
              question: 'In Pavlov\'s experiment, the bell eventually became the:',
              options: [
                'Unconditioned response',
                'Conditioned stimulus',
                'Unconditioned stimulus',
                'Reinforcer',
              ],
              answerIndex: 1,
              explanation: 'The bell started neutral and became a CS after pairing with food.',
            },
          ],
        },
        {
          id: 'psy-l2',
          title: 'Memory Basics',
          subtitle: 'Encoding, storage, retrieval',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '🧠',
              title: 'Three stages of memory',
              body: 'Memory involves encoding (getting information in), storage (keeping it), and retrieval (getting it out). The multi-store model distinguishes sensory, short-term, and long-term memory — each with different capacity and duration.',
              keyTerm: 'Working memory',
              keyTermDef: 'Active, limited-capacity system for holding information in use.',
            },
            {
              type: 'flashcard',
              front: 'Ebbinghaus forgetting curve',
              back: 'Memory of new material drops sharply at first, then levels off — why spaced repetition helps.',
            },
            {
              type: 'fillblank',
              sentence: 'The ___ effect shows that people remember the first and last items in a list best.',
              options: ['serial position', 'placebo', 'anchoring', 'halo'],
              answerIndex: 0,
              explanation: 'Primacy and recency effects are parts of the serial position phenomenon.',
            },
          ],
        },
      ],
    },
    {
      id: 'psy-u2',
      title: 'Thinking & Biases',
      description: 'How we decide — and misfire.',
      difficulty: 'intermediate',
      prerequisites: ['psy-u1'],
      lessons: [
        {
          id: 'psy-l3',
          title: 'Cognitive Biases',
          subtitle: 'Mental shortcuts with side effects',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🎯',
              title: 'System 1 vs System 2',
              body: 'Kahneman described fast, intuitive thinking (System 1) and slow, deliberate thinking (System 2). Heuristics save effort but produce predictable biases — confirmation bias, availability, anchoring.',
              keyTerm: 'Heuristic',
              keyTermDef: 'A mental shortcut that often works but can lead to error.',
            },
            {
              type: 'quiz',
              question: 'Confirmation bias is the tendency to:',
              options: [
                'Remember only recent events',
                'Seek and favor information that supports existing beliefs',
                'Overestimate rare risks',
                'Follow crowd behavior',
              ],
              answerIndex: 1,
              explanation: 'We notice and accept evidence that fits what we already think.',
            },
            {
              type: 'truefalse',
              statement: 'Anchoring means irrelevant numbers can influence your estimates.',
              answer: true,
              explanation: 'Even random anchors can shift judgments — seen in pricing and negotiations.',
            },
          ],
        },
        {
          id: 'psy-l4',
          title: 'The Milgram Experiment',
          subtitle: 'Obedience and authority',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '⚡',
              title: 'Ordinary people, shocking results',
              body: 'Milgram (1961) found most participants obeyed an authority figure and administered what they believed were painful shocks. The study revealed the power of situational factors and legitimate authority — and sparked ethics debates.',
            },
            {
              type: 'ordering',
              prompt: 'Order the typical steps in Milgram\'s procedure.',
              items: [
                'Participant draws "teacher" role',
                'Learner strapped to shock apparatus',
                'Authority prods: "Please continue"',
                'Voltage increased with each wrong answer',
              ],
              explanation: 'The experimenter\'s prods were scripted to escalate obedience pressure.',
            },
            {
              type: 'quote',
              text: 'The disappearance of a sense of responsibility is the most far-reaching consequence of submission to authority.',
              author: 'Stanley Milgram',
            },
          ],
        },
      ],
    },
    {
      id: 'psy-u3',
      title: 'Wellbeing & Personality',
      description: 'Traits, stress, and mental health literacy.',
      difficulty: 'advanced',
      prerequisites: ['psy-u2'],
      lessons: [
        {
          id: 'psy-l5',
          title: 'Big Five Personality',
          subtitle: 'OCEAN traits',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🌊',
              title: 'Five broad dimensions',
              body: 'The Big Five model describes personality along Openness, Conscientiousness, Extraversion, Agreeableness, and Neuroticism. Scores are continuous — traits, not types — and show modest stability over adulthood.',
            },
            {
              type: 'matching',
              prompt: 'Match each Big Five trait to a description.',
              pairs: [
                { left: 'Conscientiousness', right: 'Organization and discipline' },
                { left: 'Neuroticism', right: 'Emotional instability / anxiety' },
                { left: 'Openness', right: 'Curiosity and creativity' },
              ],
              explanation: 'OCEAN = Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism.',
            },
            {
              type: 'quiz',
              question: 'Big Five traits are best described as:',
              options: [
                'Fixed categories you\'re born into',
                'Continuous dimensions with genetic and environmental influence',
                'Only measurable in childhood',
                'Unrelated to job performance',
              ],
              answerIndex: 1,
              explanation: 'Traits are spectra; conscientiousness especially predicts many life outcomes.',
            },
          ],
        },
        {
          id: 'psy-l6',
          title: 'Stress & Coping',
          subtitle: 'Fight, flight, and recovery',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🫀',
              title: 'Stress response',
              body: 'The body\'s stress response (HPA axis, cortisol, sympathetic activation) prepares for threat. Chronic stress without recovery harms health; effective coping includes problem-focused strategies, social support, and reappraisal.',
            },
            {
              type: 'fillblank',
              sentence: '___ coping means changing how you think about a stressor rather than changing the situation.',
              options: ['Emotion-focused', 'Problem-focused', 'Avoidant', 'Instrumental'],
              answerIndex: 0,
              explanation: 'Emotion-focused coping targets feelings and interpretations; problem-focused changes the source.',
            },
            {
              type: 'truefalse',
              statement: 'Some stress can improve performance up to a point (Yerkes-Dodson).',
              answer: true,
              explanation: 'Moderate arousal can sharpen focus; too much impairs it.',
            },
          ],
        },
      ],
    },
  ],
};
