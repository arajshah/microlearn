import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LessonCard, MatchingCard, OrderingCard } from '@/types/content';
import {
  isAnswerCorrect,
  isMatchingCorrect,
  isOrderingCorrect,
  shuffledIndices,
  shuffledRights,
} from '@/utils/cards';
import { colors, font, radius, spacing } from '@/theme/theme';

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
        <Text style={styles.conceptBody}>{card.body}</Text>
        {card.keyTerm ? (
          <View style={[styles.keyTermBox, { borderLeftColor: accent }]}>
            <Text style={[styles.keyTermLabel, { color: accent }]}>{card.keyTerm}</Text>
            <Text style={styles.keyTermDef}>{card.keyTermDef}</Text>
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
    const parts = card.sentence.split('___');
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>FILL IN THE BLANK</Text>
        <Text style={styles.questionText}>
          {parts[0]}
          <Text style={{ color: accent }}>______</Text>
          {parts[1] ?? ''}
        </Text>
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {card.options.map((opt, i) => (
            <OptionButton
              key={i}
              label={opt}
              state={optionState(i, selected, revealed, card.answerIndex)}
              onPress={() => onSelect(i, i === card.answerIndex)}
            />
          ))}
        </View>
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
        <Text style={styles.conceptBody}>{card.body}</Text>
      </View>
    );
  }

  if (card.type === 'recall') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>RECALL</Text>
        <Text style={styles.conceptTitle}>{card.prompt}</Text>
        <Text style={styles.conceptBody}>{card.body}</Text>
      </View>
    );
  }

  if (card.type === 'explanation') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>EXPLANATION</Text>
        <Text style={styles.conceptTitle}>{card.title}</Text>
        <Text style={styles.conceptBody}>{card.body}</Text>
        {card.keyTerm ? (
          <View style={[styles.keyTermBox, { borderLeftColor: accent }]}>
            <Text style={[styles.keyTermLabel, { color: accent }]}>{card.keyTerm}</Text>
            <Text style={styles.keyTermDef}>{card.keyTermDef}</Text>
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
        <Text style={styles.conceptBody}>{card.body}</Text>
      </View>
    );
  }

  if (card.type === 'summary') {
    return (
      <View style={styles.conceptWrap}>
        <Text style={styles.questionKicker}>SUMMARY</Text>
        {card.title ? <Text style={styles.conceptTitle}>{card.title}</Text> : null}
        {card.points.map((p) => (
          <Text key={p} style={styles.conceptBody}>
            • {p}
          </Text>
        ))}
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
        <Text style={styles.conceptBody}>{card.body}</Text>
      </View>
    );
  }

  if (card.type === 'misconception') {
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>COMMON MISCONCEPTION</Text>
        <Text style={[styles.questionText, { color: colors.textMuted, fontSize: font.size.sm }]}>
          {card.misconception}
        </Text>
        <Text style={[styles.questionText, { marginTop: spacing.md }]}>{card.question}</Text>
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {card.options.map((opt, i) => (
            <OptionButton
              key={i}
              label={opt}
              state={optionState(i, selected, revealed, card.answerIndex)}
              onPress={() => onSelect(i, i === card.answerIndex)}
            />
          ))}
        </View>
      </View>
    );
  }

  if (card.type === 'application') {
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>APPLY IT</Text>
        <Text style={styles.questionText}>{card.question}</Text>
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {card.options.map((opt, i) => (
            <OptionButton
              key={i}
              label={opt}
              state={optionState(i, selected, revealed, card.answerIndex)}
              onPress={() => onSelect(i, i === card.answerIndex)}
            />
          ))}
        </View>
      </View>
    );
  }

  if (card.type === 'prediction') {
    return (
      <View style={styles.questionWrap}>
        <Text style={styles.questionKicker}>PREDICT</Text>
        <Text style={[styles.questionText, { color: colors.textMuted, fontSize: font.size.sm }]}>
          {card.scenario}
        </Text>
        <Text style={[styles.questionText, { marginTop: spacing.md }]}>{card.question}</Text>
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {card.options.map((opt, i) => (
            <OptionButton
              key={i}
              label={opt}
              state={optionState(i, selected, revealed, card.answerIndex)}
              onPress={() => onSelect(i, i === card.answerIndex)}
            />
          ))}
        </View>
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

  return (
    <View style={styles.questionWrap}>
      <Text style={styles.questionKicker}>QUICK CHECK</Text>
      <Text style={styles.questionText}>{card.question}</Text>
      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        {card.options.map((opt, i) => (
          <OptionButton
            key={i}
            label={opt}
            state={optionState(i, selected, revealed, card.answerIndex)}
            onPress={() => onSelect(i, i === card.answerIndex)}
          />
        ))}
      </View>
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
  const rightOrder = useMemo(() => shuffledRights(card, card.pairs.length * 7), [card]);
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const [matches, setMatches] = useState<Record<number, number>>({});

  const pickRight = (displayIdx: number) => {
    if (revealed || activeLeft == null) return;
    const next = { ...matches, [activeLeft]: displayIdx };
    setMatches(next);
    setActiveLeft(null);
    if (Object.keys(next).length === card.pairs.length) {
      onGrade(isMatchingCorrect(card, next, rightOrder));
    }
  };

  const usedRights = new Set(Object.values(matches));

  return (
    <View style={styles.questionWrap}>
      <Text style={styles.questionKicker}>MATCHING</Text>
      <Text style={styles.questionText}>{card.prompt}</Text>
      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        {card.pairs.map((pair, leftIdx) => {
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
                  → {card.pairs[rightOrder[matches[leftIdx]]].right}
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
                  <Text style={styles.optionText}>{card.pairs[origIdx].right}</Text>
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
  const [order, setOrder] = useState(() =>
    shuffledIndices(card.items.length, card.items.join('').length),
  );

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
    onGrade(isOrderingCorrect(card, order));
  };

  return (
    <View style={styles.questionWrap}>
      <Text style={styles.questionKicker}>PUT IN ORDER</Text>
      <Text style={styles.questionText}>{card.prompt}</Text>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        {order.map((itemIdx, pos) => (
          <View key={pos} style={styles.orderRow}>
            <Text style={styles.orderNum}>{pos + 1}</Text>
            <Text style={[styles.optionText, { flex: 1 }]}>{card.items[itemIdx]}</Text>
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
      <Text style={styles.explanationText}>{card.explanation}</Text>
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
