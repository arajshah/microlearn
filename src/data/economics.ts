import { Subject } from '@/types/content';

export const economics: Subject = {
  id: 'economics',
  title: 'Economics',
  tagline: 'How the world allocates what it wants',
  description:
    'From scarcity and incentives to markets, money, and macro. Build intuition for the forces shaping prices, jobs, and nations.',
  icon: 'trending-up',
  gradient: ['#0FB37D', '#0A7A57'],
  accent: '#2BD4A0',
  units: [
    {
      id: 'eco-u1',
      title: 'Thinking Like an Economist',
      description: 'The core lens: scarcity, trade-offs, and incentives.',
      lessons: [
        {
          id: 'eco-l1',
          title: 'Scarcity & Trade-offs',
          subtitle: 'Why every choice has a cost',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '⚖️',
              title: 'Economics starts with scarcity',
              body: 'We have unlimited wants but limited resources — time, money, materials, attention. Because we can\'t have it all, every choice means giving something up. Economics is the study of how people, firms, and societies make those choices.',
              keyTerm: 'Scarcity',
              keyTermDef: 'The gap between unlimited wants and limited resources.',
            },
            {
              type: 'concept',
              emoji: '🔁',
              title: 'Opportunity cost',
              body: 'The true cost of any decision isn\'t the money you spend — it\'s the next-best alternative you give up. Spending an evening studying costs you the movie you could have watched. Naming the opportunity cost reveals the real trade-off.',
              keyTerm: 'Opportunity cost',
              keyTermDef: 'The value of the best option you forgo when you choose.',
            },
            {
              type: 'quiz',
              question:
                'You spend $40 and 3 hours at a concert. Instead, you could have earned $60 working. What is the opportunity cost?',
              options: [
                'Only the $40 ticket',
                'The $60 you could have earned (plus what the $40 could buy)',
                'Nothing — you enjoyed it',
                'The 3 hours only',
              ],
              answerIndex: 1,
              explanation:
                'Opportunity cost is the value of the forgone alternative. The best alternative here was earning $60, and the $40 had other uses too.',
            },
            {
              type: 'truefalse',
              statement: 'If something is "free", it has no opportunity cost.',
              answer: false,
              explanation:
                'Even free things cost time and attention. A free seminar still costs the hours you could have spent elsewhere.',
            },
            {
              type: 'quote',
              text: 'There is no such thing as a free lunch.',
              author: 'Popularized by Milton Friedman',
            },
          ],
        },
        {
          id: 'eco-l2',
          title: 'Incentives Matter',
          subtitle: 'People respond to costs and rewards',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🎯',
              title: 'The central idea: incentives',
              body: 'An incentive is anything that motivates a choice by changing its costs or benefits. Raise the price of cigarettes and people smoke less. Subsidize solar panels and more get installed. Almost every economic policy is an attempt to shift incentives.',
              keyTerm: 'Incentive',
              keyTermDef: 'A reward or penalty that influences behavior.',
            },
            {
              type: 'concept',
              emoji: '⚠️',
              title: 'Beware perverse incentives',
              body: 'Incentives can backfire. When colonial officials paid a bounty for dead cobras, people began breeding cobras to collect the reward. When the program ended, they released the snakes — making the problem worse. Always ask: how might people game this?',
              keyTerm: 'Perverse incentive',
              keyTermDef: 'An incentive with an unintended, counterproductive effect.',
            },
            {
              type: 'quiz',
              question:
                'A city pays contractors per mile of road repaired. What perverse incentive might appear?',
              options: [
                'Contractors repair roads too well',
                'Contractors favor long, easy roads over urgent, complex ones',
                'Contractors refuse all work',
                'There is no perverse incentive',
              ],
              answerIndex: 1,
              explanation:
                'Paying per mile rewards quantity, not need or quality — so contractors chase easy mileage rather than the most important repairs.',
            },
            {
              type: 'truefalse',
              statement: 'Good policy design means anticipating how people will respond to incentives.',
              answer: true,
              explanation:
                'Behavior shifts with incentives. Smart policy predicts those responses — including the unintended ones.',
            },
          ],
        },
        {
          id: 'eco-l3',
          title: 'Marginal Thinking',
          subtitle: 'Decisions happen at the edge',
          minutes: 3,
          cards: [
            {
              type: 'concept',
              emoji: '➕',
              title: 'Think at the margin',
              body: 'Rational decisions compare the extra benefit and extra cost of one more unit — not totals. Should you study one more hour? Eat one more slice? The "marginal" question is: is the next step worth it?',
              keyTerm: 'Marginal analysis',
              keyTermDef: 'Comparing the added benefit and added cost of one more unit.',
            },
            {
              type: 'concept',
              emoji: '💧',
              title: 'The diamond–water paradox',
              body: 'Water is essential yet cheap; diamonds are useless yet costly. Why? Value is set at the margin. Water is abundant, so one more liter adds little. Diamonds are scarce, so one more is prized. Price reflects marginal value, not total importance.',
            },
            {
              type: 'quiz',
              question: 'A buffet is "all you can eat." How does a rational diner decide when to stop?',
              options: [
                'When the total food eaten equals the price paid',
                'When the marginal enjoyment of one more bite drops to roughly zero',
                'When the plate is empty',
                'Never — it is unlimited',
              ],
              answerIndex: 1,
              explanation:
                'The price is already sunk. The rational rule is to keep eating only while each additional bite still adds enjoyment.',
            },
          ],
        },
      ],
    },
    {
      id: 'eco-u2',
      title: 'Markets & Prices',
      description: 'Supply, demand, and the signals that coordinate us.',
      lessons: [
        {
          id: 'eco-l4',
          title: 'Supply & Demand',
          subtitle: 'The most useful model in economics',
          minutes: 5,
          cards: [
            {
              type: 'concept',
              emoji: '📉',
              title: 'The law of demand',
              body: 'All else equal, when the price of a good rises, people buy less of it; when it falls, they buy more. This is why a downward-sloping demand curve is the starting point for almost every market analysis.',
              keyTerm: 'Demand',
              keyTermDef: 'How much buyers want at each price.',
            },
            {
              type: 'concept',
              emoji: '📈',
              title: 'The law of supply',
              body: 'Higher prices make selling more attractive, so producers offer more. The supply curve slopes upward. Buyers and sellers want opposite things — and the market reconciles them through price.',
              keyTerm: 'Supply',
              keyTermDef: 'How much sellers will provide at each price.',
            },
            {
              type: 'concept',
              emoji: '⚖️',
              title: 'Equilibrium',
              body: 'The market clears where supply meets demand — the equilibrium price. Above it, surpluses push prices down. Below it, shortages push prices up. No one designs this point; it emerges from countless individual choices.',
              keyTerm: 'Equilibrium',
              keyTermDef: 'The price where quantity supplied equals quantity demanded.',
            },
            {
              type: 'quiz',
              question:
                'A frost destroys half the coffee crop. What happens in the coffee market?',
              options: [
                'Supply falls, price rises',
                'Demand falls, price falls',
                'Supply rises, price falls',
                'Nothing changes',
              ],
              answerIndex: 0,
              explanation:
                'Fewer beans means the supply curve shifts left. With less coffee available, the equilibrium price rises.',
            },
            {
              type: 'truefalse',
              statement:
                'A change in price causes the demand curve itself to shift.',
              answer: false,
              explanation:
                'A price change moves you ALONG the demand curve. The curve shifts only when something else changes (income, tastes, prices of related goods).',
            },
          ],
        },
        {
          id: 'eco-l5',
          title: 'Prices as Signals',
          subtitle: 'Information you can act on',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🚦',
              title: 'Prices carry information',
              body: 'A rising price quietly tells everyone "this is scarcer or more wanted — use less, make more." No central planner sends the message; the price does. This is how millions of strangers coordinate without ever meeting.',
              keyTerm: 'Price signal',
              keyTermDef: 'Information about scarcity and value conveyed by a price.',
            },
            {
              type: 'quote',
              text: 'The curious task of economics is to demonstrate to men how little they really know about what they imagine they can design.',
              author: 'Friedrich Hayek',
            },
            {
              type: 'quiz',
              question: 'After a hurricane, the price of bottled water spikes. What useful function can the high price serve?',
              options: [
                'It signals scarcity, discouraging hoarding and attracting new supply',
                'It serves no function at all',
                'It only enriches sellers with no benefit',
                'It permanently raises prices everywhere',
              ],
              answerIndex: 0,
              explanation:
                'Though painful, a high price rations scarce water toward urgent needs and gives suppliers a strong reason to rush more in. (This is why "price gouging" is economically debated.)',
            },
          ],
        },
        {
          id: 'eco-l6',
          title: 'Elasticity',
          subtitle: 'How sensitive is the response?',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🎈',
              title: 'Elastic vs. inelastic',
              body: 'Elasticity measures how strongly quantity responds to a price change. If a small price rise sharply cuts demand, it is "elastic" (e.g., a specific brand of soda). If demand barely moves, it is "inelastic" (e.g., insulin).',
              keyTerm: 'Price elasticity',
              keyTermDef: 'The % change in quantity divided by the % change in price.',
            },
            {
              type: 'quiz',
              question: 'Which good is most likely to have INELASTIC demand?',
              options: [
                'One particular brand of potato chips',
                'Life-saving medication with no substitute',
                'A specific airline on a popular route',
                'A single restaurant in a food court',
              ],
              answerIndex: 1,
              explanation:
                'With no substitutes and high necessity, buyers keep purchasing even as the price rises — demand is inelastic.',
            },
            {
              type: 'truefalse',
              statement: 'Goods with many close substitutes tend to have more elastic demand.',
              answer: true,
              explanation:
                'If buyers can easily switch, even a small price rise sends them to alternatives — so demand is elastic.',
            },
          ],
        },
      ],
    },
    {
      id: 'eco-u3',
      title: 'Money & the Macroeconomy',
      description: 'Inflation, growth, and the big picture.',
      lessons: [
        {
          id: 'eco-l7',
          title: 'What Is Money?',
          subtitle: 'Three jobs money does',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '💵',
              title: 'Money\'s three roles',
              body: 'Money is a medium of exchange (we trade with it), a unit of account (we price things in it), and a store of value (we save it for later). Anything that does all three well — shells, gold, dollars — can serve as money.',
              keyTerm: 'Medium of exchange',
              keyTermDef: 'Something widely accepted in trade, removing the need for barter.',
            },
            {
              type: 'concept',
              emoji: '🤝',
              title: 'Why barter fails',
              body: 'Barter needs a "double coincidence of wants" — you must find someone who has what you want and wants what you have. Money breaks this bottleneck: sell to anyone, buy from anyone. That single trick massively expands trade.',
            },
            {
              type: 'quiz',
              question:
                'A farmer wants shoes; the cobbler wants bread, not wheat. Why does money solve this?',
              options: [
                'It forces the cobbler to accept wheat',
                'The farmer sells wheat for money, then buys shoes — no matching needed',
                'It makes wheat more valuable',
                'It eliminates the need for shoes',
              ],
              answerIndex: 1,
              explanation:
                'Money removes the double-coincidence problem. The farmer converts goods to money and spends it anywhere.',
            },
          ],
        },
        {
          id: 'eco-l8',
          title: 'Inflation',
          subtitle: 'When money buys less',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🎈',
              title: 'What inflation is',
              body: 'Inflation is a sustained rise in the general price level — each unit of money buys a little less over time. Mild, steady inflation is normal; rapid inflation erodes savings and scrambles the price signals people rely on.',
              keyTerm: 'Inflation',
              keyTermDef: 'A general, ongoing increase in prices that reduces money\'s purchasing power.',
            },
            {
              type: 'concept',
              emoji: '🖨️',
              title: 'A common cause: too much money',
              body: 'When the quantity of money grows much faster than the goods available to buy, more dollars chase the same stuff and prices climb. Hyperinflations — like 1920s Germany — almost always follow runaway money printing.',
            },
            {
              type: 'quiz',
              question:
                'Inflation is 8% a year and your savings earn 2%. What happens to your real wealth?',
              options: [
                'It grows by 2%',
                'It stays flat',
                'It shrinks by about 6% in purchasing power',
                'It grows by 10%',
              ],
              answerIndex: 2,
              explanation:
                'Real return ≈ nominal return − inflation = 2% − 8% = −6%. Your money buys roughly 6% less each year.',
            },
            {
              type: 'truefalse',
              statement: 'A little predictable inflation can be healthier for an economy than deflation.',
              answer: true,
              explanation:
                'Deflation can freeze spending and raise debt burdens. Most central banks target low, steady inflation (around 2%) as a stable middle ground.',
            },
          ],
        },
        {
          id: 'eco-l9',
          title: 'GDP & Growth',
          subtitle: 'Measuring an economy',
          minutes: 4,
          cards: [
            {
              type: 'concept',
              emoji: '🏭',
              title: 'GDP in one line',
              body: 'Gross Domestic Product is the market value of all final goods and services a country produces in a period. It is the most common scorecard for the size of an economy — and changes in it signal booms and recessions.',
              keyTerm: 'GDP',
              keyTermDef: 'The total value of final goods and services produced within a country.',
            },
            {
              type: 'concept',
              emoji: '🌱',
              title: 'Growth comes from productivity',
              body: 'Over the long run, living standards rise mainly when each worker produces more — through better tools, skills, and ideas. Productivity growth, compounded over decades, is why your life differs so much from a great-grandparent\'s.',
              keyTerm: 'Productivity',
              keyTermDef: 'Output produced per unit of input (often per hour worked).',
            },
            {
              type: 'quiz',
              question: 'Which would NOT directly count in this year\'s GDP?',
              options: [
                'A new car built and sold this year',
                'A haircut you paid for this year',
                'Reselling a used car built last year',
                'A loaf of bread baked and bought this year',
              ],
              answerIndex: 2,
              explanation:
                'GDP counts newly produced final goods. Reselling a used item just transfers an existing asset — it was already counted when first produced.',
            },
            {
              type: 'quote',
              text: 'Productivity isn\'t everything, but in the long run it is almost everything.',
              author: 'Paul Krugman',
            },
          ],
        },
      ],
    },
  ],
};
