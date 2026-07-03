import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardContent } from '@/components/CardView';
import { useLibrary } from '@/context/LibraryContext';
import { useSpeech } from '@/hooks/useSpeech';
import { cardToSpeech } from '@/utils/cards';
import { colors, font, radius, spacing } from '@/theme/theme';

const PAUSE_MS = 1200;

export default function ListenSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { resolveLesson } = useLibrary();
  const { speaking, speak, stop } = useSpeech();

  const location = useMemo(() => resolveLesson(id ?? ''), [id, resolveLesson]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cards = location?.lesson.cards ?? [];
  const card = cards[index];
  const subject = location?.subject;
  const finished = index >= cards.length - 1 && !speaking && !playing;

  useEffect(() => {
    return () => {
      stop();
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [stop]);

  useEffect(() => {
    if (!location || !playing || !card) return;

    const text = cardToSpeech(card);
    speak(text);

    advanceTimer.current = setTimeout(() => {
      if (index < cards.length - 1) {
        setIndex((i) => i + 1);
      } else {
        setPlaying(false);
      }
    }, Math.max(3000, text.length * 55 + PAUSE_MS));

    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [index, playing, location, card, cards.length, speak]);

  if (!location || !subject) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.missing}>Lesson not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            stop();
            setPlaying(false);
            router.back();
          }}
          hitSlop={12}
        >
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Listen mode</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {location.lesson.title}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            if (playing) {
              stop();
              setPlaying(false);
            } else if (index < cards.length - 1) {
              setPlaying(true);
            }
          }}
          style={styles.playBtn}
        >
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={22}
            color={subject.accent}
          />
        </Pressable>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${((index + 1) / cards.length) * 100}%`,
              backgroundColor: subject.accent,
            },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.cardArea} showsVerticalScrollIndicator={false}>
        {card ? (
          <CardContent
            card={card}
            accent={subject.accent}
            selected={null}
            revealed={false}
            onSelect={() => {}}
          />
        ) : null}
        {finished ? (
          <View style={styles.doneBox}>
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            <Text style={styles.doneText}>Lesson complete — hands free!</Text>
          </View>
        ) : (
          <Text style={styles.status}>
            {speaking ? 'Speaking…' : playing ? 'Up next…' : 'Paused'}
          </Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={styles.counter}>
          Card {index + 1} of {cards.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  missing: { color: colors.textMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.heavy as '800' },
  sub: { color: colors.textMuted, fontSize: font.size.xs },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.surfaceAlt,
    marginHorizontal: spacing.lg,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  progressFill: { height: '100%' },
  cardArea: { padding: spacing.lg, flexGrow: 1, gap: spacing.lg },
  status: { color: colors.textFaint, textAlign: 'center', fontSize: font.size.sm },
  doneBox: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  doneText: { color: colors.success, fontWeight: font.weight.bold as '700' },
  footer: { paddingHorizontal: spacing.lg, alignItems: 'center' },
  counter: { color: colors.textMuted, fontSize: font.size.sm },
});
