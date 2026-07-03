import { Subject } from '@/types/content';

export const philosophy: Subject = {
  id: 'philosophy',
  title: 'Philosophy',
  tagline: 'The art of thinking clearly about everything',
  description:
    'Ethics, knowledge, logic, and the mind. Learn the questions and tools that have shaped 2,500 years of human thought.',
  icon: 'bulb',
  gradient: ['#F0A23B', '#C8761B'],
  accent: '#FFC061',
  units: [
    {
      id: 'phi-u1',
      title: 'How Should We Live?',
      description: 'The big questions of ethics.',
      lessons: [
        {
          id: 'phi-l1',
          title: 'What Is Ethics?',
          subtitle: 'The study of right and wrong',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🧭',
              title: 'Ethics asks how to live',
              body: 'Ethics is the branch of philosophy that examines what we ought to do, what makes actions right or wrong, and what kind of person we should become. It moves beyond "what is" to "what should be."',
              keyTerm: 'Ethics',
              keyTermDef: 'The systematic study of morality — right, wrong, and the good life.',
            },
            {
              type: 'concept',
              emoji: '🔀',
              title: 'Three great traditions',
              body: 'Western ethics offers three big approaches: consequentialism (judge by outcomes), deontology (judge by duties and rules), and virtue ethics (judge by character). Each captures something real — and they often disagree.',
            },
            {
              type: 'quiz',
              question: 'Which question is distinctly an ethical question?',
              options: [
                'How fast does light travel?',
                'Is it wrong to lie to protect a friend?',
                'What is the capital of France?',
                'How do plants make energy?',
              ],
              answerIndex: 1,
              explanation:
                'Ethics concerns what we ought to do. Only the question about lying is normative — about right and wrong.',
            },
            {
              type: 'truefalse',
              statement: 'Ethics is only about following the law.',
              answer: false,
              explanation:
                'Laws and morality overlap but differ. Some legal acts are unethical, and some ethical acts have been illegal. Ethics asks deeper questions than legality.',
            },
          ],
        },
        {
          id: 'phi-l2',
          title: 'Consequences vs. Duties',
          subtitle: 'Two ways to judge actions',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '📊',
              title: 'Utilitarianism: maximize well-being',
              body: 'Consequentialists, especially utilitarians, say an action is right if it produces the greatest good for the greatest number. The morality of an act lives entirely in its results. Bentham and Mill are its founders.',
              keyTerm: 'Utilitarianism',
              keyTermDef: 'The view that the right act is the one producing the most overall well-being.',
            },
            {
              type: 'concept',
              emoji: '📜',
              title: 'Kant: act from duty',
              body: 'Kant\'s deontology says some acts are wrong regardless of outcome. Act only on a rule you could will everyone to follow, and treat people as ends in themselves, never merely as means. Lying is wrong even if it "works."',
              keyTerm: 'Categorical imperative',
              keyTermDef: 'Kant\'s rule: act only on principles you could will to be universal law.',
            },
            {
              type: 'quiz',
              question:
                'A doctor could secretly harvest one healthy patient\'s organs to save five dying patients. A strict utilitarian and a Kantian disagree. Why might the Kantian object?',
              options: [
                'Saving five is worse than saving one',
                'It uses a person merely as a means, violating their dignity',
                'The math is wrong',
                'Doctors should never operate',
              ],
              answerIndex: 1,
              explanation:
                'For Kant, you may never treat a person merely as a tool for others\' ends — even to produce a better outcome.',
            },
            {
              type: 'truefalse',
              statement:
                'Utilitarianism can, in principle, justify sacrificing an individual for the greater good.',
              answer: true,
              explanation:
                'Because it judges only by aggregate outcomes, utilitarianism can endorse harming one to help many — a famous objection to the theory.',
            },
            {
              type: 'quote',
              text: 'Act so that you treat humanity, whether in your own person or in that of another, always as an end and never as a means only.',
              author: 'Immanuel Kant',
            },
          ],
        },
        {
          id: 'phi-l3',
          title: 'Virtue & Character',
          subtitle: 'Aristotle\'s answer',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🌿',
              title: 'Become a good person',
              body: 'Aristotle shifts the question from "what should I do?" to "who should I become?" The good life — eudaimonia, or flourishing — comes from cultivating virtues like courage and honesty until they become second nature.',
              keyTerm: 'Eudaimonia',
              keyTermDef: 'Flourishing or living well — the highest human good, per Aristotle.',
            },
            {
              type: 'concept',
              emoji: '🎯',
              title: 'The golden mean',
              body: 'Each virtue sits between two extremes. Courage lies between cowardice and recklessness; generosity between stinginess and wastefulness. Wisdom is finding the right amount, at the right time, for the right reason.',
              keyTerm: 'Golden mean',
              keyTermDef: 'The virtuous middle ground between deficiency and excess.',
            },
            {
              type: 'quiz',
              question: 'According to the golden mean, the virtue of courage is the mean between which two extremes?',
              options: [
                'Honesty and deceit',
                'Cowardice and recklessness',
                'Generosity and greed',
                'Pride and humility',
              ],
              answerIndex: 1,
              explanation:
                'Too little boldness is cowardice; too much is recklessness. Courage is the balanced middle.',
            },
          ],
        },
      ],
    },
    {
      id: 'phi-u2',
      title: 'What Can We Know?',
      description: 'Knowledge, doubt, and certainty.',
      lessons: [
        {
          id: 'phi-l4',
          title: 'The Problem of Knowledge',
          subtitle: 'When is a belief knowledge?',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🧠',
              title: 'Justified true belief',
              body: 'For centuries, knowledge was defined as justified true belief: you know something if you believe it, it\'s true, and you have good reason. All three are needed — a lucky guess that happens to be true isn\'t knowledge.',
              keyTerm: 'Epistemology',
              keyTermDef: 'The study of knowledge: what it is and how we get it.',
            },
            {
              type: 'concept',
              emoji: '🌀',
              title: 'The Gettier twist',
              body: 'In 1963 Edmund Gettier showed you can have a justified true belief that still isn\'t knowledge — if it\'s true by luck. A stopped clock reads 3:00, and you glance at it at exactly 3:00. Your belief is justified and true, yet accidental.',
            },
            {
              type: 'quiz',
              question: 'You believe it will rain because a reliable forecast said so. It does rain — but actually because of a freak event the forecast never predicted. Is this knowledge?',
              options: [
                'Yes, the belief was true and justified',
                'Arguably not — it was true by luck, not because of your reason (a Gettier case)',
                'Yes, because it rained',
                'No, because forecasts are never reliable',
              ],
              answerIndex: 1,
              explanation:
                'Like Gettier cases, the belief is justified and true but the truth came apart from the justification — challenging "justified true belief."',
            },
            {
              type: 'truefalse',
              statement: 'A true belief always counts as knowledge.',
              answer: false,
              explanation:
                'A lucky guess can be true without being knowledge. Knowledge needs justification (and, per Gettier, perhaps more).',
            },
          ],
        },
        {
          id: 'phi-l5',
          title: 'Descartes\' Doubt',
          subtitle: 'Searching for certainty',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🕳️',
              title: 'Doubt everything',
              body: 'Descartes tried to doubt all he could: his senses can deceive, dreams feel real, and maybe an evil demon fools him about everything. He sought one belief that survives total doubt — a foundation for knowledge.',
              keyTerm: 'Methodological doubt',
              keyTermDef: 'Deliberately doubting all beliefs to find what is certain.',
            },
            {
              type: 'concept',
              emoji: '💭',
              title: '"I think, therefore I am"',
              body: 'Even if everything is doubted, the very act of doubting proves a thinker exists. You cannot be deceived about the fact that you are thinking. From this single certainty — cogito, ergo sum — Descartes rebuilds knowledge.',
              keyTerm: 'Cogito ergo sum',
              keyTermDef: '"I think, therefore I am" — Descartes\' one indubitable truth.',
            },
            {
              type: 'quiz',
              question: 'Why can\'t the "evil demon" deceive you about the fact that you are thinking?',
              options: [
                'Demons cannot lie',
                'Being deceived is itself a form of thinking, which proves a thinker exists',
                'Thinking is always true',
                'The senses are reliable',
              ],
              answerIndex: 1,
              explanation:
                'To be deceived, you must think. So the existence of your thought is certain even under maximal doubt.',
            },
            {
              type: 'quote',
              text: 'I think, therefore I am.',
              author: 'René Descartes',
            },
          ],
        },
      ],
    },
    {
      id: 'phi-u3',
      title: 'Logic & Argument',
      description: 'Tools for thinking well.',
      lessons: [
        {
          id: 'phi-l6',
          title: 'Anatomy of an Argument',
          subtitle: 'Premises, conclusions, validity',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🧩',
              title: 'Premises and conclusions',
              body: 'An argument is a set of statements (premises) offered to support another statement (the conclusion). Philosophy runs on arguments — not on who shouts loudest, but on which reasons actually hold up.',
              keyTerm: 'Argument',
              keyTermDef: 'Premises offered as reasons to accept a conclusion.',
            },
            {
              type: 'concept',
              emoji: '🔗',
              title: 'Valid vs. sound',
              body: 'An argument is valid if the conclusion must follow when the premises are true. It is sound if it is valid AND the premises are actually true. A valid argument can still be false if it starts from a false premise.',
              keyTerm: 'Soundness',
              keyTermDef: 'A valid argument whose premises are all true.',
            },
            {
              type: 'quiz',
              question:
                '"All cats can fly. Felix is a cat. So Felix can fly." This argument is…',
              options: [
                'Valid but not sound',
                'Sound',
                'Invalid',
                'Neither valid nor an argument',
              ],
              answerIndex: 0,
              explanation:
                'The logic is valid (conclusion follows IF premises were true), but it is unsound because the first premise is false.',
            },
            {
              type: 'truefalse',
              statement: 'A valid argument guarantees a true conclusion.',
              answer: false,
              explanation:
                'Validity only guarantees the conclusion follows IF the premises are true. Garbage in, garbage out — you also need true premises (soundness).',
            },
          ],
        },
        {
          id: 'phi-l7',
          title: 'Spotting Fallacies',
          subtitle: 'Common ways reasoning fails',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🚧',
              title: 'What is a fallacy?',
              body: 'A logical fallacy is a flaw in reasoning that can make a bad argument feel persuasive. Learning to name them is like learning to spot magic tricks — once you see the move, the illusion breaks.',
              keyTerm: 'Fallacy',
              keyTermDef: 'A common error in reasoning that undermines an argument.',
            },
            {
              type: 'concept',
              emoji: '👤',
              title: 'Ad hominem & straw man',
              body: 'Ad hominem attacks the person instead of their argument ("You\'re wrong because you\'re young"). A straw man distorts an opponent\'s view into a weaker one, then refutes that. Both dodge the real point.',
            },
            {
              type: 'quiz',
              question:
                '"We shouldn\'t listen to her climate plan — she flew on a plane once." Which fallacy is this?',
              options: [
                'Straw man',
                'Ad hominem (attacking the person, not the argument)',
                'Slippery slope',
                'False dilemma',
              ],
              answerIndex: 1,
              explanation:
                'It targets the person\'s character/behavior rather than engaging the actual argument — a textbook ad hominem.',
            },
            {
              type: 'truefalse',
              statement: 'A false dilemma presents only two options when more exist.',
              answer: true,
              explanation:
                'The false dilemma (either/or fallacy) artificially narrows the choices, hiding real alternatives.',
            },
          ],
        },
      ],
    },
  ],
};
