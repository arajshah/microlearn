import { Subject } from '@/types/content';

export const history: Subject = {
  id: 'history',
  title: 'History',
  tagline: 'How the past shapes the present',
  description:
    'From ancient civilizations to revolutions and world wars — understand the forces, people, and ideas that built our world.',
  icon: 'time',
  gradient: ['#8B4513', '#5C2E0A'],
  accent: '#D4A574',
  units: [
    {
      id: 'hist-u1',
      title: 'Foundations of Civilization',
      description: 'Agriculture, empires, and the birth of cities.',
      difficulty: 'beginner',
      lessons: [
        {
          id: 'hist-l1',
          title: 'The Agricultural Revolution',
          subtitle: 'When humans settled down',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🌾',
              title: 'Farming changed everything',
              body: 'Roughly 10,000 years ago, humans in several regions independently began domesticating plants and animals. Farming produced surpluses, which supported larger populations, specialization, and eventually cities and states.',
              keyTerm: 'Neolithic Revolution',
              keyTermDef: 'The shift from hunting-gathering to agriculture.',
            },
            {
              type: 'fillblank',
              sentence: 'Surplus food allowed some people to specialize as priests, soldiers, and ___ instead of farming.',
              options: ['artisans', 'nomads', 'herders only', 'hunters'],
              answerIndex: 0,
              explanation:
                'Specialization — people doing non-farming jobs — was only possible once farming produced extra food.',
            },
            {
              type: 'quiz',
              question: 'Which is a direct consequence of agriculture?',
              options: [
                'Smaller, scattered bands',
                'Permanent settlements and population growth',
                'Less trade between groups',
                'Uniform global culture',
              ],
              answerIndex: 1,
              explanation:
                'Agriculture tied people to land, enabled surpluses, and supported denser, more complex societies.',
            },
            {
              type: 'quote',
              text: 'The past is never dead. It\'s not even past.',
              author: 'William Faulkner',
            },
          ],
        },
        {
          id: 'hist-l2',
          title: 'Empires & Administration',
          subtitle: 'How rulers held vast territories together',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '🏛️',
              title: 'Empires need glue',
              body: 'Large empires used roads, standardized currency, legal codes, and shared ideology (or religion) to unify diverse peoples. Rome\'s roads and law, Persia\'s satrapies, and China\'s bureaucracy are classic examples.',
              keyTerm: 'Imperial administration',
              keyTermDef: 'Systems rulers use to tax, govern, and integrate conquered lands.',
            },
            {
              type: 'matching',
              prompt: 'Match each empire to a hallmark of its rule.',
              pairs: [
                { left: 'Roman Empire', right: 'Roads & codified law' },
                { left: 'Persian Empire', right: 'Tolerant satrap system' },
                { left: 'Han China', right: 'Merit-based bureaucracy' },
              ],
              explanation:
                'Each empire developed distinct tools of integration suited to its geography and culture.',
            },
            {
              type: 'truefalse',
              statement: 'Empires typically had no need for shared infrastructure like roads.',
              answer: false,
              explanation:
                'Infrastructure accelerated trade, troop movement, and communication — essential for holding territory.',
            },
          ],
        },
      ],
    },
    {
      id: 'hist-u2',
      title: 'Revolutions & Ideas',
      description: 'Enlightenment thought and political upheaval.',
      difficulty: 'intermediate',
      prerequisites: ['hist-u1'],
      lessons: [
        {
          id: 'hist-l3',
          title: 'The Enlightenment',
          subtitle: 'Reason, rights, and reform',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '💡',
              title: 'Age of Reason',
              body: 'In the 17th–18th centuries, thinkers across Europe argued that reason, science, and individual rights should guide society — challenging divine-right monarchy and tradition.',
              keyTerm: 'Enlightenment',
              keyTermDef: 'Intellectual movement emphasizing reason, liberty, and progress.',
            },
            {
              type: 'flashcard',
              front: 'Social Contract (Enlightenment idea)',
              back: 'Legitimate government rests on agreement among the governed — popularized by Rousseau and others.',
            },
            {
              type: 'quiz',
              question: 'Which Enlightenment idea most directly inspired democratic revolutions?',
              options: [
                'Divine right of kings',
                'Natural rights and popular sovereignty',
                'Mercantilism',
                'Feudal obligation',
              ],
              answerIndex: 1,
              explanation:
                'Locke and others argued people have inherent rights and can replace rulers who violate them.',
            },
          ],
        },
        {
          id: 'hist-l4',
          title: 'The French Revolution',
          subtitle: 'Liberty, equality — and terror',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '⚔️',
              title: '1789 and after',
              body: 'Fiscal crisis, food shortages, and Enlightenment ideas fueled revolution in France. The monarchy fell, a republic was declared, and radical phases (including the Reign of Terror) reshaped European politics for a century.',
            },
            {
              type: 'ordering',
              prompt: 'Order these phases of the early French Revolution.',
              items: [
                'Estates-General meets (1789)',
                'Storming of the Bastille',
                'Declaration of the Rights of Man',
                'Execution of Louis XVI (1793)',
              ],
              explanation:
                'The revolution escalated from constitutional crisis to republican radicalism over several years.',
            },
            {
              type: 'truefalse',
              statement: 'The French Revolution had no impact outside France.',
              answer: false,
              explanation:
                'It inspired and terrified rulers across Europe and spread nationalist and liberal ideas globally.',
            },
          ],
        },
      ],
    },
    {
      id: 'hist-u3',
      title: 'The Modern World',
      description: 'Industrialization, world wars, and the Cold War.',
      difficulty: 'advanced',
      prerequisites: ['hist-u2'],
      lessons: [
        {
          id: 'hist-l5',
          title: 'World War I',
          subtitle: 'The war that broke the old order',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '🌍',
              title: 'Total war begins',
              body: 'WWI (1914–1918) mobilized entire economies and societies. Trench warfare, new technology, and collapsing empires killed millions and set the stage for WWII and revolutions from Russia to the Middle East.',
            },
            {
              type: 'fillblank',
              sentence: 'The assassination of Archduke Franz Ferdinand in ___ triggered the alliance system\'s cascade into war.',
              options: ['Sarajevo', 'Paris', 'Berlin', 'Vienna'],
              answerIndex: 0,
              explanation: 'The June 1914 shooting in Sarajevo lit the fuse of European alliances.',
            },
            {
              type: 'quiz',
              question: 'A major long-term consequence of WWI was:',
              options: [
                'Strengthened Ottoman Empire',
                'Collapse of four empires and redrawn maps',
                'End of nationalism',
                'Global peace for 50 years',
              ],
              answerIndex: 1,
              explanation:
                'German, Austro-Hungarian, Ottoman, and Russian empires fell or transformed; new states emerged.',
            },
          ],
        },
        {
          id: 'hist-l6',
          title: 'Cold War Framework',
          subtitle: 'Two superpowers, one planet',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '☢️',
              title: 'Bipolar world',
              body: 'After WWII, the US and USSR led rival blocs — nuclear-armed, ideologically opposed, yet avoiding direct war. Proxy conflicts, space races, and détente defined 1945–1991.',
              keyTerm: 'Containment',
              keyTermDef: 'US strategy to limit Soviet expansion without full-scale war.',
            },
            {
              type: 'matching',
              prompt: 'Match Cold War terms to definitions.',
              pairs: [
                { left: 'Iron Curtain', right: 'Division of Europe East/West' },
                { left: 'NATO', right: 'Western military alliance' },
                { left: 'Proxy war', right: 'Conflict fought by allies of superpowers' },
              ],
              explanation: 'These concepts explain how rivalry played out short of WWIII.',
            },
            {
              type: 'quote',
              text: 'From Stettin in the Baltic to Trieste in the Adriatic, an iron curtain has descended.',
              author: 'Winston Churchill, 1946',
            },
          ],
        },
      ],
    },
  ],
};
