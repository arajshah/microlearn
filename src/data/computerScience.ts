import { Subject } from '@/types/content';

export const computerScience: Subject = {
  id: 'computer-science',
  title: 'Computer Science',
  tagline: 'The science of solving problems with machines',
  description:
    'Algorithms, data, and the ideas that power computing. Build true intuition for how software thinks — no jargon required.',
  icon: 'code-slash',
  gradient: ['#3B82F6', '#1D4ED8'],
  accent: '#60A5FA',
  units: [
    {
      id: 'cs-u1',
      title: 'Algorithms & Thinking',
      description: 'How computers solve problems step by step.',
      lessons: [
        {
          id: 'cs-l1',
          title: 'What Is an Algorithm?',
          subtitle: 'Recipes for computers',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '📝',
              title: 'An algorithm is a recipe',
              body: 'An algorithm is a finite, ordered set of unambiguous steps that solves a problem or completes a task. A cooking recipe, long division, and a route from A to B are all algorithms. Computers just follow them very fast and very literally.',
              keyTerm: 'Algorithm',
              keyTermDef: 'A precise, finite sequence of steps that solves a problem.',
            },
            {
              type: 'concept',
              emoji: '🎯',
              title: 'Good algorithms have key traits',
              body: 'A solid algorithm is correct (gives the right answer), finite (it ends), and definite (each step is unambiguous). Beyond that, we care about efficiency — how its time and memory grow as the input gets bigger.',
            },
            {
              type: 'quiz',
              question: 'Which of these is NOT a property a good algorithm must have?',
              options: [
                'It always terminates',
                'Every step is unambiguous',
                'It uses the most recent programming language',
                'It produces a correct result',
              ],
              answerIndex: 2,
              explanation:
                'Algorithms are language-independent ideas. Correctness, finiteness, and definiteness matter — not which language implements them.',
            },
            {
              type: 'truefalse',
              statement: 'The same algorithm can be written in many different programming languages.',
              answer: true,
              explanation:
                'An algorithm is an abstract method. Python, Java, or C can all implement the very same algorithm.',
            },
          ],
        },
        {
          id: 'cs-l2',
          title: 'Big-O Notation',
          subtitle: 'Measuring how things scale',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '📈',
              title: 'Why we measure growth',
              body: 'We don\'t time algorithms with a stopwatch — hardware varies. Instead we ask: as the input doubles, how does the work grow? Big-O notation describes this growth rate, ignoring constant factors and focusing on the big picture.',
              keyTerm: 'Big-O',
              keyTermDef: 'A notation for how an algorithm\'s cost grows with input size.',
            },
            {
              type: 'concept',
              emoji: '🔍',
              title: 'A tour of common rates',
              body: 'O(1) constant — instant, regardless of size. O(log n) — halves the problem each step (binary search). O(n) — checks each item once. O(n²) — nested loops over the data. As n grows, these diverge dramatically.',
            },
            {
              type: 'quiz',
              question: 'Looking up a value by its key in a well-built hash table is typically which complexity?',
              options: ['O(n²)', 'O(n)', 'O(log n)', 'O(1) on average'],
              answerIndex: 3,
              explanation:
                'Hash tables jump nearly straight to the slot, so average lookup is constant time, O(1) — independent of size.',
            },
            {
              type: 'quiz',
              question: 'An algorithm with two nested loops over n items is usually…',
              options: ['O(1)', 'O(log n)', 'O(n²)', 'O(n)'],
              answerIndex: 2,
              explanation:
                'For each of n items you do n work, giving n × n = n² total — quadratic time.',
            },
            {
              type: 'truefalse',
              statement: 'For large inputs, an O(log n) algorithm is faster than an O(n) one.',
              answer: true,
              explanation:
                'Logarithmic growth is far slower than linear. As n grows huge, O(log n) wins decisively.',
            },
          ],
        },
        {
          id: 'cs-l3',
          title: 'Searching & Sorting',
          subtitle: 'Classic algorithms in action',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '✂️',
              title: 'Binary search: divide and conquer',
              body: 'To find a name in a sorted phone book, you don\'t scan page 1 onward — you open the middle, decide which half to keep, and repeat. Each step halves the search space. A million entries take only ~20 checks. That\'s O(log n).',
              keyTerm: 'Binary search',
              keyTermDef: 'Repeatedly halving a sorted range to find a target in O(log n).',
            },
            {
              type: 'concept',
              emoji: '🫧',
              title: 'Sorting unlocks speed',
              body: 'Many fast techniques (like binary search) require sorted data. Simple sorts like bubble sort are O(n²); efficient ones like merge sort and quicksort reach O(n log n). Sorting is often the first step that makes everything else fast.',
            },
            {
              type: 'quiz',
              question: 'Binary search requires that the data first be…',
              options: [
                'Stored in a hash table',
                'Sorted',
                'Reversed',
                'Duplicated',
              ],
              answerIndex: 1,
              explanation:
                'Binary search relies on order to decide which half to discard. Unsorted data breaks the method.',
            },
            {
              type: 'quiz',
              question: 'About how many steps does binary search need for 1,000,000 sorted items?',
              options: ['About 1,000,000', 'About 1,000', 'About 20', 'About 2'],
              answerIndex: 2,
              explanation:
                'log₂(1,000,000) ≈ 20. Halving repeatedly gets you there in roughly 20 comparisons.',
            },
          ],
        },
      ],
    },
    {
      id: 'cs-u2',
      title: 'Data Structures',
      description: 'How we organize information.',
      lessons: [
        {
          id: 'cs-l4',
          title: 'Arrays & Lists',
          subtitle: 'The workhorses of data',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🗃️',
              title: 'Arrays: indexed boxes',
              body: 'An array stores items in a contiguous block of memory, each at a numbered index. That makes reading item #500 instant — the computer computes its address directly. But inserting in the middle means shifting everything after it.',
              keyTerm: 'Array',
              keyTermDef: 'A fixed sequence of items stored at indexed positions.',
            },
            {
              type: 'concept',
              emoji: '🔗',
              title: 'Linked lists: chains of nodes',
              body: 'A linked list stores each item in a "node" that points to the next. Inserting or deleting is cheap — just rewire pointers. But finding item #500 means walking the chain from the start. Every structure trades one strength for another.',
              keyTerm: 'Linked list',
              keyTermDef: 'A chain of nodes where each points to the next.',
            },
            {
              type: 'quiz',
              question: 'You need instant access to any item by its position number. Which is better?',
              options: [
                'Linked list',
                'Array',
                'They are identical',
                'Neither allows it',
              ],
              answerIndex: 1,
              explanation:
                'Arrays give O(1) random access by index. A linked list must traverse from the head, which is O(n).',
            },
            {
              type: 'truefalse',
              statement: 'Inserting an item in the middle of a large array is essentially free.',
              answer: false,
              explanation:
                'It requires shifting every later element to make room — an O(n) operation. Linked lists handle mid-insertions more cheaply.',
            },
          ],
        },
        {
          id: 'cs-l5',
          title: 'Stacks & Queues',
          subtitle: 'Order of access matters',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🥞',
              title: 'Stack: last in, first out',
              body: 'A stack is like a pile of plates — you add and remove from the top. The last item in is the first out (LIFO). The "undo" button and the call stack that tracks running functions both work exactly this way.',
              keyTerm: 'Stack (LIFO)',
              keyTermDef: 'A structure where the last item added is the first removed.',
            },
            {
              type: 'concept',
              emoji: '🎟️',
              title: 'Queue: first in, first out',
              body: 'A queue is like a line at a ticket counter — first to arrive is first served (FIFO). Print jobs, task schedulers, and message systems use queues to process things fairly in arrival order.',
              keyTerm: 'Queue (FIFO)',
              keyTermDef: 'A structure where the first item added is the first removed.',
            },
            {
              type: 'quiz',
              question: 'Which real-world feature behaves like a STACK?',
              options: [
                'A line at the bank',
                'A printer processing jobs in order received',
                'The "undo" history in an editor',
                'People boarding a bus first-come-first-served',
              ],
              answerIndex: 2,
              explanation:
                'Undo reverses your most recent action first — last in, first out, which is exactly a stack.',
            },
            {
              type: 'truefalse',
              statement: 'In a queue, the most recently added item is served first.',
              answer: false,
              explanation:
                'A queue is FIFO: the FIRST item added is served first. LIFO describes a stack.',
            },
          ],
        },
      ],
    },
    {
      id: 'cs-u3',
      title: 'How Computers Work',
      description: 'From bits to abstraction.',
      lessons: [
        {
          id: 'cs-l6',
          title: 'Binary & Bits',
          subtitle: 'The language of machines',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🔢',
              title: 'Everything is bits',
              body: 'At its core, a computer only knows two states: on and off, 1 and 0. A single such digit is a bit. Numbers, text, images, and video are all encoded as long patterns of these bits — meaning comes entirely from how we interpret them.',
              keyTerm: 'Bit',
              keyTermDef: 'A single binary digit: 0 or 1.',
            },
            {
              type: 'concept',
              emoji: '🧮',
              title: 'Counting in base 2',
              body: 'We count in base 10 (ten digits). Computers count in base 2: each position is a power of two — 1, 2, 4, 8, 16… So 1011 in binary is 8 + 0 + 2 + 1 = 11. Eight bits form a byte, enough for 256 different values.',
              keyTerm: 'Byte',
              keyTermDef: 'A group of 8 bits, representing 256 possible values.',
            },
            {
              type: 'quiz',
              question: 'What is the binary number 1010 in our usual base-10 system?',
              options: ['5', '8', '10', '12'],
              answerIndex: 2,
              explanation:
                'Positions are 8, 4, 2, 1. So 1010 = 8 + 0 + 2 + 0 = 10.',
            },
            {
              type: 'quiz',
              question: 'How many distinct values can a single byte (8 bits) represent?',
              options: ['8', '64', '128', '256'],
              answerIndex: 3,
              explanation:
                'Each bit doubles the possibilities: 2⁸ = 256 distinct values (0–255).',
            },
          ],
        },
        {
          id: 'cs-l7',
          title: 'Abstraction',
          subtitle: 'The big idea behind all software',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🪜',
              title: 'Hiding complexity on purpose',
              body: 'Abstraction means hiding messy details behind a simple interface. You drive a car without knowing combustion; you use an app without seeing the code. Computing is layers of abstraction, each one standing on the one below.',
              keyTerm: 'Abstraction',
              keyTermDef: 'Hiding complex details behind a simpler interface.',
            },
            {
              type: 'concept',
              emoji: '🏗️',
              title: 'Layers all the way down',
              body: 'A web app sits on a language, which sits on a compiler, which targets machine code, which runs on circuits switching bits. Each layer trusts the one beneath it. Abstraction is what lets humans build systems too complex for any one mind.',
            },
            {
              type: 'quiz',
              question: 'Using a function without knowing how it works internally is an example of…',
              options: [
                'Binary encoding',
                'Abstraction',
                'Sorting',
                'Recursion',
              ],
              answerIndex: 1,
              explanation:
                'You rely on the function\'s interface while its implementation stays hidden — the essence of abstraction.',
            },
            {
              type: 'truefalse',
              statement: 'Abstraction lets programmers build on others\' work without understanding every detail.',
              answer: true,
              explanation:
                'That is exactly its power: clean interfaces let us compose vast systems without holding all the details at once.',
            },
            {
              type: 'quote',
              text: 'All problems in computer science can be solved by another level of indirection.',
              author: 'David Wheeler',
            },
          ],
        },
      ],
    },
  ],
};
