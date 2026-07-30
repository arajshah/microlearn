import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DiagramView } from '@/components/DiagramView';
import { RichContent } from '@/components/RichContent';
import { LessonCard, MatchingCard, OrderingCard } from '@/types/content';
import { resolveLessonDiagram } from '@/utils/diagramFromDescription';
import {
  isAnswerCorrect,
  isMatchingCorrect,
  isOrderingCorrect,
  shuffledIndices,
  shuffledRights,
} from '@/utils/cards';
import { colors, font, radius, spacing } from '@/theme/theme';

function safeOptions(card: { options?: unknown }): string[] {
  return Array.isArray(card.options)
    ? card.options.filter((opt): opt is string => typeof opt === 'string')
    : [];
}

function safePoints(card: { points?: unknown }): string[] {
  return Array.isArray(card.points)
    ? card.points.filter((p): p is string => typeof p === 'string')
    : [];
}

function safePairs(card: MatchingCard): MatchingCard['pairs'] {
  if (!Array.isArray(card.pairs)) return [];
  return card.pairs.filter(
    (p) => p && typeof p.left === 'string' && typeof p.right === 'string',
  );
}

function safeItems(card: OrderingCard): string[] {
  return Array.isArray(card.items)
    ? card.items.filter((item): item is string => typeof item === 'string')
    : [];
}

function InvalidCheckFallback({ prompt }: { prompt: string }) {
  return (
    <View style={styles.questionWrap}>
      <Text style={styles.questionKicker}>CHECK</Text>
      <Text style={styles.questionText}>{prompt}</Text>
      <Text style={styles.hint}>This check could not be rendered correctly.</Text>
    </View>
  );
}

function MultipleChoiceOptions({
  options,
  selected,
  revealed,
  answerIndex,
  onSelect,
}: {
  options: string[];
  selected: number | null;
  revealed: boolean;
  answerIndex: number;
  onSelect: (i: number, correct: boolean) => void;
}) {
  if (options.length === 0) return null;
  return (
    <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
      {options.map((opt, i) => (
        <OptionButton
          key={i}
          label={opt}
          state={optionState(i, selected, revealed, answerIndex)}
          onPress={() => onSelect(i, i === answerIndex)}
        />
      ))}
    </View>
  );
}

export { cardToSpeech, isAnswerCorrect } from '@/utils/cards';

/** Renders any lesson card. Interactive cards call onSelect when graded. */
export function CardContent({
  card,
  accent,
  selected,
  revealed,
  onSelect,
}: {
  card: LessonCard;
  accent: string;
  selected: number | null;
  revealed: boolean;
  onSelect: (i: number, correct: boolean) => void;
}) {
  if (card.type === 'concept') {
    return (
      <View style={styles.conceptWrap}>
        {card.emoji ? <Text style={styles.emoji}>{card.emoji}</Text> : null}
        <Text style={styles.conceptTitle}>{card.title}</Text>
        <RichContent style={styles.conceptBody}>{card.body}</RichContent>
        {card.keyTerm ? (
          <View style={[styles.keyTermBox, { borderLeftColor: accent }]}>
            <Text style={[styles.keyTermLabel, { color: accent }]}>{card.keyTerm}</Text>
            <RichContent style={styles.keyTermDef}>{card.keyTermDef ?? ''}</RichContent>
          </View>
        ) : null}
      </View>
    );
  }

  if (card.type === 'quote') {
    return (
      <View style={styles.quoteWrap}>
        <Text style={[styles.quoteMark, { color: accent }]}>&ldquo;</Text>
        <Text style={styles.quoteText}>{card.text}</Text>
        <Text style={[styles.quoteAuthor, { color: accent }]}>— {card.author}</Text>
      </View>
    );
  }

  if (card.type === 'code') {
    return (
      <View style={styles.codeWrap}>
        <Text style={styles.questionKicker}>CODE</Text>
        <Text style={styles.conceptTitle}>{card.title}</Text>
        <View style={styles.codeBlock}>
          <Text style={styles.codeLang}>{card.language}</Text>
          <Text style={styles.codeText} selectable>
            {card.code}
          </Text>
        </View>
        {card.caption ? <Text style={styles.codeCaption}>{card.caption}</Text> : null}
      </View>
    );
  }

  if (card.type === 'flashcard') {
    return <FlashcardView card={card} accent={accent} />;
  }

  if (card.type === 'fillblank') {
    const parts = (card.sentence ?? '').split('___');
    const options = safeOptions(card);
    if (options.length === 0) {
      return <InvalidCheckFallback prompt={card.sentence || 'Fill in the blank'} />;
    }
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>FILL IN THE BLANK</Text>
        <Text style={styles.questionText}>
          {parts[0]}
          <Text style={{ color: accent }}>______</Text>
          {parts[1] ?? ''}
        </Text>
        <MultipleChoiceOptions
          options={options}
          selected={selected}
          revealed={revealed}
          answerIndex={card.answerIndex ?? 0}
          onSelect={onSelect}
        />
      </View>
    );
  }

  if (card.type === 'matching') {
    return (
      <MatchingView
        card={card}
        accent={accent}
        revealed={revealed}
        onGrade={(correct) => onSelect(0, correct)}
      />
    );
  }

  if (card.type === 'ordering') {
    return (
      <OrderingView
        card={card}
        accent={accent}
        revealed={revealed}
        onGrade={(correct) => onSelect(0, correct)}
      />
    );
  }

  if (card.type === 'hook') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>CONTEXT</Text>
        <Text style={styles.conceptTitle}>{card.title}</Text>
        <RichContent style={styles.conceptBody}>{card.body}</RichContent>
      </View>
    );
  }

  if (card.type === 'recall') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>RECALL</Text>
        <Text style={styles.conceptTitle}>{card.prompt}</Text>
        <RichContent style={styles.conceptBody}>{card.body}</RichContent>
      </View>
    );
  }

  if (card.type === 'explanation') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>EXPLANATION</Text>
        <Text style={styles.conceptTitle}>{card.title}</Text>
        <RichContent style={styles.conceptBody}>{card.body}</RichContent>
        {card.keyTerm ? (
          <View style={[styles.keyTermBox, { borderLeftColor: accent }]}>
            <Text style={[styles.keyTermLabel, { color: accent }]}>{card.keyTerm}</Text>
            <RichContent style={styles.keyTermDef}>{card.keyTermDef ?? ''}</RichContent>
          </View>
        ) : null}
      </View>
    );
  }

  if (card.type === 'example') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>EXAMPLE</Text>
        <Text style={styles.conceptTitle}>{card.title}</Text>
        <RichContent style={styles.conceptBody}>{card.body}</RichContent>
      </View>
    );
  }

  if (card.type === 'summary') {
    const points = safePoints(card);
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>SUMMARY</Text>
        {card.title ? <Text style={styles.conceptTitle}>{card.title}</Text> : null}
        {points.length > 0 ? (
          points.map((p) => (
            <RichContent key={p} style={styles.conceptBody}>
              {`• ${p}`}
            </RichContent>
          ))
        ) : (
          <Text style={styles.conceptBody}>No summary points available.</Text>
        )}
      </View>
    );
  }

  if (card.type === 'next_connection') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>UP NEXT</Text>
        {card.nextTitle ? (
          <Text style={[styles.conceptTitle, { color: accent }]}>{card.nextTitle}</Text>
        ) : null}
        <RichContent style={styles.conceptBody}>{card.body}</RichContent>
      </View>
    );
  }

  if (card.type === 'misconception') {
    const options = safeOptions(card);
    if (options.length === 0) {
      return <InvalidCheckFallback prompt={card.question || card.misconception || 'Review'} />;
    }
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>COMMON MISCONCEPTION</Text>
        <Text style={[styles.questionText, { color: colors.textMuted, fontSize: font.size.sm }]}>
          {card.misconception}
        </Text>
        <Text style={[styles.questionText, { marginTop: spacing.md }]}>{card.question}</Text>
        <MultipleChoiceOptions
          options={options}
          selected={selected}
          revealed={revealed}
          answerIndex={card.answerIndex ?? 0}
          onSelect={onSelect}
        />
      </View>
    );
  }

  if (card.type === 'application') {
    const options = safeOptions(card);
    if (options.length === 0) {
      return <InvalidCheckFallback prompt={card.question || 'Apply it'} />;
    }
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>APPLY IT</Text>
        <Text style={styles.questionText}>{card.question}</Text>
        <MultipleChoiceOptions
          options={options}
          selected={selected}
          revealed={revealed}
          answerIndex={card.answerIndex ?? 0}
          onSelect={onSelect}
        />
      </View>
    );
  }

  if (card.type === 'prediction') {
    const options = safeOptions(card);
    if (options.length === 0) {
      return <InvalidCheckFallback prompt={card.question || card.scenario || 'Predict'} />;
    }
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>PREDICT</Text>
        <Text style={[styles.questionText, { color: colors.textMuted, fontSize: font.size.sm }]}>
          {card.scenario}
        </Text>
        <Text style={[styles.questionText, { marginTop: spacing.md }]}>{card.question}</Text>
        <MultipleChoiceOptions
          options={options}
          selected={selected}
          revealed={revealed}
          answerIndex={card.answerIndex ?? 0}
          onSelect={onSelect}
        />
      </View>
    );
  }

  if (card.type === 'truefalse') {
    const correctIndex = card.answer ? 1 : 0;
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>TRUE OR FALSE</Text>
        <Text style={styles.questionText}>{card.statement}</Text>
        <View style={styles.tfRow}>
          {['False', 'True'].map((label, i) => (
            <OptionButton
              key={label}
              label={label}
              state={optionState(i, selected, revealed, correctIndex)}
              onPress={() => onSelect(i, i === correctIndex)}
              wide
            />
          ))}
        </View>
      </View>
    );
  }

  if (card.type === 'quiz') {
    const options = safeOptions(card);
    if (options.length === 0) {
      return <InvalidCheckFallback prompt={card.question || 'Quick check'} />;
    }
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>QUICK CHECK</Text>
        <Text style={styles.questionText}>{card.question}</Text>
        <MultipleChoiceOptions
          options={options}
          selected={selected}
          revealed={revealed}
          answerIndex={card.answerIndex ?? 0}
          onSelect={onSelect}
        />
      </View>
    );
  }

  if (card.type === 'formula') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>FORMULA</Text>
        <Text style={styles.conceptTitle}>{card.title}</Text>
        <View style={[styles.formulaBox, { borderLeftColor: accent }]}>
          <RichContent accent={accent}>{card.formula}</RichContent>
        </View>
        <RichContent style={styles.conceptBody}>{card.plainEnglish}</RichContent>
        {card.notation && card.notation.length > 0 ? (
          <View style={styles.notationList}>
            {card.notation.map((n) => (
              <View key={`${n.symbol}-${n.meaning}`} style={styles.notationRowWrap}>
                <RichContent accent={accent} style={styles.notationSymbol}>
                  {n.symbol}
                </RichContent>
                <Text style={styles.notationDash}> — </Text>
                <RichContent style={styles.notationRow}>{n.meaning}</RichContent>
              </View>
            ))}
          </View>
        ) : null}
        {card.body ? <RichContent style={styles.conceptBody}>{card.body}</RichContent> : null}
      </View>
    );
  }

  if (card.type === 'derivation') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>DERIVATION</Text>
        <Text style={styles.conceptTitle}>{card.title}</Text>
        <RichContent style={styles.conceptBody}>{card.setup}</RichContent>
        <StepList
          steps={card.steps.map((s, i) => ({
            label: s.label ?? `Step ${i + 1}`,
            detail: s.expression,
            explanation: s.explanation,
          }))}
          accent={accent}
        />
        <View style={[styles.keyTermBox, { borderLeftColor: accent }]}>
          <Text style={[styles.keyTermLabel, { color: accent }]}>Conclusion</Text>
          <RichContent style={styles.keyTermDef}>{card.conclusion}</RichContent>
        </View>
      </View>
    );
  }

  if (card.type === 'worked_example') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>WORKED EXAMPLE</Text>
        <Text style={styles.conceptTitle}>{card.title}</Text>
        <RichContent style={styles.conceptBody}>{card.problem}</RichContent>
        <StepList
          steps={card.steps.map((s, i) => ({
            label: s.label ?? `Step ${i + 1}`,
            detail: s.work,
            explanation: s.explanation,
          }))}
          accent={accent}
        />
        <View style={[styles.keyTermBox, { borderLeftColor: accent }]}>
          <Text style={[styles.keyTermLabel, { color: accent }]}>Answer</Text>
          <RichContent style={styles.keyTermDef}>{card.answer}</RichContent>
        </View>
        <RichContent style={styles.conceptBody}>{card.insight}</RichContent>
      </View>
    );
  }

  if (card.type === 'misconception_check') {
    const options = safeOptions(card);
    if (options.length === 0) {
      return <InvalidCheckFallback prompt={card.question || card.misconception || 'Review'} />;
    }
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>MISCONCEPTION CHECK</Text>
        <Text style={[styles.questionText, { color: colors.textMuted, fontSize: font.size.sm }]}>
          {card.misconception}
        </Text>
        <Text style={[styles.questionText, { marginTop: spacing.md }]}>{card.question}</Text>
        <MultipleChoiceOptions
          options={options}
          selected={selected}
          revealed={revealed}
          answerIndex={card.answerIndex ?? 0}
          onSelect={onSelect}
        />
      </View>
    );
  }

  if (card.type === 'compare_contrast') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>COMPARE & CONTRAST</Text>
        <Text style={styles.conceptTitle}>{card.title}</Text>
        <View style={styles.compareHeader}>
          <Text style={[styles.compareLabel, { color: accent }]}>{card.leftLabel}</Text>
          <Text style={styles.compareLabel}>{card.rightLabel}</Text>
        </View>
        {card.points.map((point, i) => (
          <View key={`${point.left}-${i}`} style={styles.compareRow}>
            <View style={styles.compareCellWrap}>
              <RichContent style={styles.compareCell}>{point.left}</RichContent>
            </View>
            <View style={styles.compareCellWrap}>
              <RichContent style={styles.compareCell}>{point.right}</RichContent>
            </View>
          </View>
        ))}
        <View style={[styles.keyTermBox, { borderLeftColor: accent }]}>
          <RichContent style={styles.keyTermDef}>{card.takeaway}</RichContent>
        </View>
      </View>
    );
  }

  if (card.type === 'visual_model') {
    const diagram = resolveLessonDiagram(card.diagram, card.visualDescription);
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>VISUAL MODEL</Text>
        <Text style={styles.conceptTitle}>{card.title}</Text>
        {diagram ? (
          <DiagramView diagram={diagram} accent={accent} />
        ) : (
          <View style={[styles.visualPanel, { borderColor: `${accent}55` }]}>
            <Ionicons name="eye-outline" size={22} color={accent} />
            <RichContent style={styles.visualDesc}>{card.visualDescription}</RichContent>
          </View>
        )}
        <RichContent style={styles.conceptBody}>{card.body}</RichContent>
        <RichContent style={{ ...styles.conceptBody, color: accent }}>{card.takeaway}</RichContent>
      </View>
    );
  }

  return (
    <View style={styles.questionWrap}>
      <Text style={styles.questionKicker}>SLIDE</Text>
      <Text style={styles.questionText}>This slide could not be rendered.</Text>
    </View>
  );
}

function StepList({
  steps,
  accent,
}: {
  steps: Array<{ label: string; detail?: string; explanation: string }>;
  accent: string;
}) {
  return (
    <View style={styles.stepList}>
      {steps.map((step, i) => (
        <View key={`${step.label}-${i}`} style={styles.stepRow}>
          <View style={[styles.stepBadge, { backgroundColor: `${accent}22` }]}>
            <Text style={[styles.stepBadgeText, { color: accent }]}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {step.label ? <Text style={styles.stepLabel}>{step.label}</Text> : null}
            {step.detail ? (
              <RichContent
                style={{ ...styles.stepDetail, color: accent }}
                accent={accent}
              >
                {step.detail}
              </RichContent>
            ) : null}
            <RichContent style={styles.stepExplanation}>{step.explanation}</RichContent>
          </View>
        </View>
      ))}
    </View>
  );
}

function FlashcardView({
  card,
  accent,
}: {
  card: { front: string; back: string };
  accent: string;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <Pressable onPress={() => setFlipped((f) => !f)} style={styles.flashWrap}>
      <Text style={styles.questionKicker}>FLASHCARD · tap to flip</Text>
      <View style={[styles.flashCard, { borderColor: accent }]}>
        <Text style={styles.flashText}>{flipped ? card.back : card.front}</Text>
        <Ionicons
          name="refresh"
          size={18}
          color={colors.textFaint}
          style={{ marginTop: spacing.md }}
        />
      </View>
    </Pressable>
  );
}

function MatchingView({
  card,
  accent,
  revealed,
  onGrade,
}: {
  card: MatchingCard;
  accent: string;
  revealed: boolean;
  onGrade: (correct: boolean) => void;
}) {
  const pairs = safePairs(card);
  const rightOrder = useMemo(() => shuffledRights({ ...card, pairs }, pairs.length * 7), [card, pairs]);
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const [matches, setMatches] = useState<Record<number, number>>({});

  const pickRight = (displayIdx: number) => {
    if (revealed || activeLeft == null) return;
    const next = { ...matches, [activeLeft]: displayIdx };
    setMatches(next);
    setActiveLeft(null);
    if (Object.keys(next).length === pairs.length) {
      onGrade(isMatchingCorrect({ ...card, pairs }, next, rightOrder));
    }
  };

  const usedRights = new Set(Object.values(matches));

  if (pairs.length === 0) {
    return <InvalidCheckFallback prompt={card.prompt || 'Matching activity'} />;
  }

  return (
    <View style={styles.questionWrap}>
      <Text style={styles.questionKicker}>MATCHING</Text>
      <Text style={styles.questionText}>{card.prompt}</Text>
      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        {pairs.map((pair, leftIdx) => {
          const matched = matches[leftIdx] != null;
          const isWrong =
            revealed && matched && rightOrder[matches[leftIdx]] !== leftIdx;
          const isRight = revealed && matched && rightOrder[matches[leftIdx]] === leftIdx;
          return (
            <View key={leftIdx} style={{ gap: spacing.sm }}>
              <Pressable
                disabled={revealed || matched}
                onPress={() => setActiveLeft(leftIdx)}
                style={[
                  styles.matchLeft,
                  activeLeft === leftIdx && { borderColor: accent },
                  isRight && { borderColor: colors.success, backgroundColor: colors.successDark },
                  isWrong && { borderColor: colors.danger, backgroundColor: colors.dangerDark },
                ]}
              >
                <Text style={styles.optionText}>{pair.left}</Text>
              </Pressable>
              {matched ? (
                <Text style={[styles.matchArrow, { color: accent }]}>
                  → {pairs[rightOrder[matches[leftIdx]]]?.right ?? ''}
                </Text>
              ) : null}
            </View>
          );
        })}
        {!revealed && activeLeft != null ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Text style={styles.hint}>Pick the matching term:</Text>
            {rightOrder.map((origIdx, displayIdx) => {
              if (usedRights.has(displayIdx)) return null;
              return (
                <Pressable
                  key={displayIdx}
                  onPress={() => pickRight(displayIdx)}
                  style={styles.matchRight}
                >
                  <Text style={styles.optionText}>{pairs[origIdx]?.right ?? ''}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function OrderingView({
  card,
  accent,
  revealed,
  onGrade,
}: {
  card: OrderingCard;
  accent: string;
  revealed: boolean;
  onGrade: (correct: boolean) => void;
}) {
  const items = safeItems(card);
  const [order, setOrder] = useState(() =>
    shuffledIndices(items.length, items.join('').length),
  );

  if (items.length === 0) {
    return <InvalidCheckFallback prompt={card.prompt || 'Ordering activity'} />;
  }

  const move = (pos: number, dir: -1 | 1) => {
    if (revealed) return;
    const next = [...order];
    const target = pos + dir;
    if (target < 0 || target >= next.length) return;
    [next[pos], next[target]] = [next[target], next[pos]];
    setOrder(next);
  };

  const check = () => {
    if (revealed) return;
    onGrade(isOrderingCorrect({ ...card, items }, order));
  };

  return (
    <View style={styles.questionWrap}>
      <Text style={styles.questionKicker}>PUT IN ORDER</Text>
      <Text style={styles.questionText}>{card.prompt}</Text>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        {order.map((itemIdx, pos) => (
          <View key={pos} style={styles.orderRow}>
            <Text style={styles.orderNum}>{pos + 1}</Text>
            <Text style={[styles.optionText, { flex: 1 }]}>{items[itemIdx] ?? ''}</Text>
            {!revealed ? (
              <View style={styles.orderBtns}>
                <Pressable onPress={() => move(pos, -1)} hitSlop={6}>
                  <Ionicons name="chevron-up" size={20} color={colors.textMuted} />
                </Pressable>
                <Pressable onPress={() => move(pos, 1)} hitSlop={6}>
                  <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      {!revealed ? (
        <Pressable onPress={check} style={[styles.checkBtn, { backgroundColor: accent }]}>
          <Text style={styles.checkBtnText}>Check order</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type OptState = 'idle' | 'selectedWrong' | 'correct' | 'dimmed';

function optionState(
  i: number,
  selected: number | null,
  revealed: boolean,
  correctIndex: number,
): OptState {
  if (!revealed) return 'idle';
  if (i === correctIndex) return 'correct';
  if (i === selected) return 'selectedWrong';
  return 'dimmed';
}

function OptionButton({
  label,
  state,
  onPress,
  wide,
}: {
  label: string;
  state: OptState;
  onPress: () => void;
  wide?: boolean;
}) {
  const bg =
    state === 'correct'
      ? colors.successDark
      : state === 'selectedWrong'
        ? colors.dangerDark
        : colors.surface;
  const border =
    state === 'correct'
      ? colors.success
      : state === 'selectedWrong'
        ? colors.danger
        : colors.border;
  const opacity = state === 'dimmed' ? 0.5 : 1;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.option,
        wide && { flex: 1, alignItems: 'center' },
        { backgroundColor: bg, borderColor: border, opacity },
      ]}
    >
      <Text style={styles.optionText}>{label}</Text>
      {state === 'correct' ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
      ) : state === 'selectedWrong' ? (
        <Ionicons name="close-circle" size={20} color={colors.danger} />
      ) : null}
    </Pressable>
  );
}

export function Explanation({
  card,
  correct,
}: {
  card: LessonCard;
  correct: boolean;
}) {
  const hasExplanation =
    card.type === 'quiz' ||
    card.type === 'truefalse' ||
    card.type === 'fillblank' ||
    card.type === 'matching' ||
    card.type === 'ordering' ||
    card.type === 'misconception' ||
    card.type === 'misconception_check' ||
    card.type === 'application' ||
    card.type === 'prediction';
  if (!hasExplanation) return null;
  return (
    <View
      style={[
        styles.explanation,
        {
          backgroundColor: correct ? colors.successDark : colors.dangerDark,
          borderColor: correct ? colors.success : colors.danger,
        },
      ]}
    >
      <View style={styles.explanationHead}>
        <Ionicons
          name={correct ? 'checkmark-circle' : 'information-circle'}
          size={18}
          color={correct ? colors.success : colors.danger}
        />
        <Text
          style={[
            styles.explanationTitle,
            { color: correct ? colors.success : colors.danger },
          ]}
        >
          {correct ? 'Correct!' : 'Not quite'}
        </Text>
      </View>
      <RichContent style={styles.explanationText}>{card.explanation}</RichContent>
    </View>
  );
}

/** Whether the user got the current card right (works for all graded types). */
export function wasCardCorrect(card: LessonCard, selected: number | null): boolean {
  if (card.type === 'matching' || card.type === 'ordering') {
    return selected === 0; // complex cards call onSelect(0, correct)
  }
  return isAnswerCorrect(card, selected);
}

const styles = StyleSheet.create({
  conceptWrap: { gap: spacing.md },
  emoji: { fontSize: 52 },
  conceptTitle: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
    lineHeight: 36,
  },
  conceptBody: { color: colors.textMuted, fontSize: font.size.lg, lineHeight: 28 },
  keyTermBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: 4,
  },
  keyTermLabel: { fontSize: font.size.md, fontWeight: font.weight.heavy as '800' },
  keyTermDef: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 21 },

  quoteWrap: { gap: spacing.md, paddingTop: spacing.xl },
  quoteMark: {
    fontSize: 80,
    fontWeight: font.weight.heavy as '800',
    height: 60,
    lineHeight: 80,
  },
  quoteText: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold as '700',
    lineHeight: 38,
    fontStyle: 'italic',
  },
  quoteAuthor: { fontSize: font.size.md, fontWeight: font.weight.bold as '700' },

  codeWrap: { gap: spacing.md },
  codeBlock: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  codeLang: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1,
  },
  codeText: {
    color: colors.success,
    fontFamily: 'Menlo',
    fontSize: font.size.sm,
    lineHeight: 20,
  },
  codeCaption: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },

  formulaBox: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  formulaText: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
    fontFamily: 'Menlo',
  },
  notationList: { gap: spacing.xs, marginTop: spacing.sm },
  notationRowWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  notationSymbol: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  notationDash: { color: colors.textMuted, fontSize: font.size.sm },
  notationRow: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20, flex: 1 },

  stepList: { gap: spacing.md, marginTop: spacing.md },
  stepRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { fontSize: font.size.sm, fontWeight: font.weight.heavy as '800' },
  stepLabel: { color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.bold as '700' },
  stepDetail: { fontSize: font.size.sm, fontFamily: 'Menlo' },
  stepExplanation: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },

  compareHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  compareLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    textTransform: 'uppercase',
  },
  compareRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  compareCell: {
    color: colors.text,
    fontSize: font.size.sm,
    lineHeight: 20,
  },
  compareCellWrap: { flex: 1 },

  visualPanel: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
  },
  visualDesc: {
    color: colors.textMuted,
    fontSize: font.size.md,
    lineHeight: 24,
    fontStyle: 'italic',
  },

  flashWrap: { gap: spacing.md },
  flashCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.xxl,
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashText: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.bold as '700',
    textAlign: 'center',
    lineHeight: 30,
  },

  questionWrap: { gap: spacing.sm },
  questionKicker: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1.5,
  },
  questionText: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.bold as '700',
    lineHeight: 30,
  },
  hint: { color: colors.textMuted, fontSize: font.size.sm },
  tfRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  optionText: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold as '600',
    flexShrink: 1,
  },
  matchLeft: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  matchRight: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgElevated,
  },
  matchArrow: { fontSize: font.size.sm, fontWeight: font.weight.semibold as '600', marginLeft: spacing.md },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderNum: {
    color: colors.textFaint,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
    width: 20,
  },
  orderBtns: { gap: 2 },
  checkBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  checkBtnText: { color: colors.bg, fontWeight: font.weight.heavy as '800', fontSize: font.size.md },

  explanation: { borderRadius: radius.md, borderWidth: 1, padding: spacing.lg, gap: 6 },
  explanationHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  explanationTitle: { fontSize: font.size.md, fontWeight: font.weight.bold as '700' },
  explanationText: { color: colors.text, fontSize: font.size.sm, lineHeight: 21 },
});
