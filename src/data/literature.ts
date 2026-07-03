import { Subject } from '@/types/content';

export const literature: Subject = {
  id: 'literature',
  title: 'Literature',
  tagline: 'How stories make meaning',
  description:
    'Story, style, and the great movements of writing. Learn to read deeply and see the machinery behind the books that move us.',
  icon: 'book',
  gradient: ['#F0567E', '#C12B58'],
  accent: '#FF7DA0',
  units: [
    {
      id: 'lit-u1',
      title: 'The Machinery of Story',
      description: 'The building blocks every narrative shares.',
      lessons: [
        {
          id: 'lit-l1',
          title: 'Plot & Conflict',
          subtitle: 'What makes a story move',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '⚡',
              title: 'No conflict, no story',
              body: 'Plot is not just "things happening" — it is events linked by cause and effect, driven by conflict. A character wants something and meets resistance. That tension is the engine that pulls a reader forward.',
              keyTerm: 'Conflict',
              keyTermDef: 'The struggle between opposing forces that drives a narrative.',
            },
            {
              type: 'concept',
              emoji: '🏔️',
              title: 'The dramatic arc',
              body: 'Freytag\'s pyramid maps many stories: exposition sets the scene, rising action builds tension, the climax is the turning point, falling action follows the fallout, and resolution restores a new normal.',
              keyTerm: 'Climax',
              keyTermDef: 'The peak of tension and the story\'s turning point.',
            },
            {
              type: 'quiz',
              question: 'E. M. Forster contrasted two sentences. Which is a PLOT, not just a story?',
              options: [
                '"The king died, and then the queen died."',
                '"The king died, and then the queen died of grief."',
                '"The king and queen lived."',
                '"There was a king and a queen."',
              ],
              answerIndex: 1,
              explanation:
                'Forster\'s point: plot adds causality. "Of grief" links the events by cause and effect, turning a sequence into a plot.',
            },
            {
              type: 'truefalse',
              statement: 'Conflict in literature must be a physical fight.',
              answer: false,
              explanation:
                'Conflict can be internal (a character vs. themselves) or against society, nature, or fate — not just person vs. person.',
            },
          ],
        },
        {
          id: 'lit-l2',
          title: 'Point of View',
          subtitle: 'Who is telling this?',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '👁️',
              title: 'The narrator shapes everything',
              body: 'Point of view decides what we see and how we judge it. First person ("I") is intimate but limited. Third-person omniscient sees all minds. Third-person limited rides one character\'s shoulder. The choice is never neutral.',
              keyTerm: 'Point of view',
              keyTermDef: 'The perspective from which a story is told.',
            },
            {
              type: 'concept',
              emoji: '🎭',
              title: 'The unreliable narrator',
              body: 'Sometimes the storyteller can\'t be trusted — through bias, naivety, or deceit. The gap between what they say and what really happened becomes its own drama. Think of a narrator who slowly reveals more than they intend.',
              keyTerm: 'Unreliable narrator',
              keyTermDef: 'A narrator whose account the reader has reason to doubt.',
            },
            {
              type: 'quiz',
              question: 'A novel narrated by a charming liar who hides his crimes from the reader uses which device?',
              options: [
                'Omniscient narration',
                'An unreliable narrator',
                'Second person',
                'A frame story',
              ],
              answerIndex: 1,
              explanation:
                'When we must read against the narrator\'s account to find the truth, the narrator is unreliable.',
            },
            {
              type: 'truefalse',
              statement: 'An omniscient narrator can reveal the thoughts of any character.',
              answer: true,
              explanation:
                'Omniscient ("all-knowing") narration has access to every character\'s inner life and events across the world of the story.',
            },
          ],
        },
        {
          id: 'lit-l3',
          title: 'Theme & Symbol',
          subtitle: 'The meaning beneath the surface',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '💡',
              title: 'Theme is the idea, not the topic',
              body: 'A topic is what a story is about ("war"); a theme is what it says ("war corrodes innocence"). Theme is the underlying insight about life that the events dramatize — usually shown, never stated outright.',
              keyTerm: 'Theme',
              keyTermDef: 'The central insight or argument a work explores.',
            },
            {
              type: 'concept',
              emoji: '🌿',
              title: 'Symbols carry weight',
              body: 'A symbol is a concrete thing standing for something larger: a green light for unreachable dreams, a scarlet letter for sin and identity. Good symbols feel natural to the story while quietly accumulating meaning.',
              keyTerm: 'Symbol',
              keyTermDef: 'An object or image that represents a deeper idea.',
            },
            {
              type: 'quiz',
              question: 'Which statement best expresses a THEME rather than a topic?',
              options: [
                'The novel is about the sea',
                'Ambition can destroy the one who pursues it',
                'The story takes place in winter',
                'The book features a whale',
              ],
              answerIndex: 1,
              explanation:
                'A theme makes a claim about life. "Ambition can destroy the one who pursues it" interprets meaning; the others just name subjects.',
            },
          ],
        },
      ],
    },
    {
      id: 'lit-u2',
      title: 'The Music of Language',
      description: 'Style, sound, and figurative language.',
      lessons: [
        {
          id: 'lit-l4',
          title: 'Metaphor & Imagery',
          subtitle: 'Seeing through language',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🖼️',
              title: 'Imagery: language for the senses',
              body: 'Imagery is descriptive language that appeals to the senses — sight, sound, smell, touch, taste. It turns abstract scenes into lived experience, letting a reader feel the cold or hear the rain.',
              keyTerm: 'Imagery',
              keyTermDef: 'Vivid sensory language that creates mental pictures.',
            },
            {
              type: 'concept',
              emoji: '🔁',
              title: 'Metaphor vs. simile',
              body: 'A simile compares using "like" or "as" ("brave as a lion"). A metaphor says one thing IS another ("he was a lion in battle"). Metaphor is bolder — it fuses two ideas so we see one through the other.',
              keyTerm: 'Metaphor',
              keyTermDef: 'A direct comparison stating one thing is another.',
            },
            {
              type: 'quiz',
              question: '"Her voice is music to my ears." This is a…',
              options: ['Simile', 'Metaphor', 'Literal statement', 'Alliteration'],
              answerIndex: 1,
              explanation:
                'It directly equates her voice with music (no "like"/"as"), making it a metaphor.',
            },
            {
              type: 'truefalse',
              statement: 'A simile always uses "like" or "as" to make its comparison.',
              answer: true,
              explanation:
                'That explicit comparison word is exactly what distinguishes a simile from a metaphor.',
            },
          ],
        },
        {
          id: 'lit-l5',
          title: 'Sound & Rhythm',
          subtitle: 'Why poetry sings',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🎵',
              title: 'The sound of sense',
              body: 'Poetry works on the ear as much as the mind. Devices like alliteration (repeated consonants), assonance (repeated vowels), and meter (rhythmic patterns) make language memorable and emotionally charged.',
              keyTerm: 'Meter',
              keyTermDef: 'The rhythmic pattern of stressed and unstressed syllables.',
            },
            {
              type: 'concept',
              emoji: '🫀',
              title: 'Iambic pentameter',
              body: 'English\'s most famous meter has five "iambs" per line — a soft beat followed by a strong one (da-DUM). It echoes the heartbeat and natural speech, which is why Shakespeare used it constantly.',
            },
            {
              type: 'quiz',
              question: 'Which line uses alliteration?',
              options: [
                'The slow green river moved on',
                'Peter piped a perfect tune',
                'She walked into the room',
                'A bright and distant star',
              ],
              answerIndex: 1,
              explanation:
                'Alliteration repeats initial consonant sounds: "Peter piped a perfect" stacks the "p" sound.',
            },
            {
              type: 'quote',
              text: 'Shall I compare thee to a summer\'s day? / Thou art more lovely and more temperate.',
              author: 'William Shakespeare, Sonnet 18',
            },
          ],
        },
      ],
    },
    {
      id: 'lit-u3',
      title: 'Movements & Masters',
      description: 'How literature changed across eras.',
      lessons: [
        {
          id: 'lit-l6',
          title: 'Tragedy & the Greeks',
          subtitle: 'Where drama began',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🏛️',
              title: 'The birth of tragedy',
              body: 'In ancient Athens, drama was a civic and religious event. Tragedies staged great figures brought low, inviting audiences to feel pity and fear — and, Aristotle argued, to experience catharsis, a purging of emotion.',
              keyTerm: 'Catharsis',
              keyTermDef: 'The emotional release or purification an audience feels through drama.',
            },
            {
              type: 'concept',
              emoji: '💔',
              title: 'The tragic flaw',
              body: 'Classic tragic heroes fall partly through hamartia — an error or flaw, often hubris (excessive pride). Oedipus\'s determination to find the truth, admirable in itself, destroys him. Greatness and downfall share one root.',
              keyTerm: 'Hamartia',
              keyTermDef: 'The tragic hero\'s fatal error or flaw.',
            },
            {
              type: 'quiz',
              question: 'In Aristotle\'s theory, "catharsis" refers to…',
              options: [
                'The hero\'s fatal flaw',
                'The emotional release felt by the audience',
                'The play\'s setting',
                'A type of rhyme',
              ],
              answerIndex: 1,
              explanation:
                'Catharsis is the purging of pity and fear the audience undergoes — a core purpose of tragedy for Aristotle.',
            },
          ],
        },
        {
          id: 'lit-l7',
          title: 'Romanticism to Modernism',
          subtitle: 'Two revolutions in writing',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '🌹',
              title: 'Romanticism: feeling and nature',
              body: 'Reacting against cold rationalism, the Romantics (Wordsworth, Keats, the Shelleys) exalted emotion, imagination, the sublime in nature, and the inner life of the individual. The personal and the wild became worthy of high art.',
              keyTerm: 'Romanticism',
              keyTermDef: 'An era prizing emotion, nature, imagination, and the individual.',
            },
            {
              type: 'concept',
              emoji: '🧬',
              title: 'Modernism: breaking the form',
              body: 'After industrialization and World War I, modernists like Woolf, Joyce, and Eliot shattered traditional structure. They used fragmentation, stream of consciousness, and ambiguity to capture a disordered, uncertain modern mind.',
              keyTerm: 'Stream of consciousness',
              keyTermDef: 'A style mimicking the unfiltered flow of a character\'s thoughts.',
            },
            {
              type: 'quiz',
              question: 'A novel that follows a character\'s unfiltered, jumping inner thoughts in real time is using…',
              options: [
                'Iambic pentameter',
                'Stream of consciousness',
                'A frame narrative',
                'Romantic pastoralism',
              ],
              answerIndex: 1,
              explanation:
                'Stream of consciousness renders the continuous, associative flow of thought — a hallmark modernist technique.',
            },
            {
              type: 'truefalse',
              statement: 'Romanticism emphasized strict reason and order over emotion.',
              answer: false,
              explanation:
                'It was the opposite: Romanticism celebrated emotion, imagination, and nature, reacting against pure rationalism.',
            },
            {
              type: 'quote',
              text: 'Poetry is the spontaneous overflow of powerful feelings.',
              author: 'William Wordsworth',
            },
          ],
        },
      ],
    },
  ],
};
