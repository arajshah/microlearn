import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AiError, tutorReply, TutorMessage } from '@/ai/client';
import { useLibrary } from '@/context/LibraryContext';
import { colors, font, radius, spacing } from '@/theme/theme';

const SUGGESTIONS = [
  'Explain this simply',
  'Give me an example',
  'Why does this matter?',
  'Quiz me on this',
];

function FormattedReply({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <View style={styles.formatted}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={i} style={{ height: 6 }} />;
        if (trimmed.startsWith('• ')) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.aiText}>{trimmed.slice(2)}</Text>
            </View>
          );
        }
        return (
          <Text key={i} style={styles.aiText}>
            {trimmed}
          </Text>
        );
      })}
    </View>
  );
}

export interface TutorPanelProps {
  context?: string;
  contextLabel?: string | null;
  accent?: string;
  variant?: 'inline' | 'fullscreen';
  onClose?: () => void;
  maxHeight?: number;
  onKeyboardChange?: (visible: boolean) => void;
}

export function TutorPanel({
  context,
  contextLabel,
  accent = colors.primary,
  variant = 'inline',
  onClose,
  maxHeight = 320,
  onKeyboardChange,
}: TutorPanelProps) {
  const insets = useSafeAreaInsets();
  const { config, hasKey } = useLibrary();
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardHeight(e.endCoordinates.height);
      onKeyboardChange?.(true);
    };
    const onHide = () => {
      setKeyboardHeight(0);
      onKeyboardChange?.(false);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [onKeyboardChange]);

  const keyboardUp = keyboardHeight > 0;
  const keyboardLift = keyboardUp
    ? Math.max(0, keyboardHeight - insets.bottom)
    : 0;

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (!hasKey) {
      setError('Add your AI key in Settings to chat with the tutor.');
      return;
    }
    setError(null);
    setInput('');
    inputRef.current?.blur();
    Keyboard.dismiss();

    const history: TutorMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(history);
    setLoading(true);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    try {
      const reply = await tutorReply(config, history, context);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      const msg = e instanceof AiError ? e.message : 'Something went wrong. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  };

  const empty = messages.length === 0;
  const isFullscreen = variant === 'fullscreen';
  const panelMaxHeight = keyboardUp
    ? Math.min(maxHeight + 80, 420)
    : maxHeight;

  const panelStyle = [
    styles.panel,
    isFullscreen ? styles.panelFullscreen : { maxHeight: panelMaxHeight },
    !isFullscreen && keyboardUp && { flex: 1, maxHeight: undefined },
    !isFullscreen && { marginBottom: keyboardLift },
  ];

  const panelContent = (
    <>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderLeft}>
          <View style={[styles.badge, { backgroundColor: `${accent}22` }]}>
            <Ionicons name="sparkles" size={14} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.panelTitle}>AI Tutor</Text>
            {contextLabel ? (
              <Text style={styles.panelSub} numberOfLines={1}>
                on “{contextLabel}”
              </Text>
            ) : (
              <Text style={styles.panelSub}>Ask while you read</Text>
            )}
          </View>
        </View>
        {onClose ? (
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {empty ? (
          <Text style={styles.welcome}>
            {contextLabel
              ? 'Ask about this card — explanations, examples, or a quick quiz.'
              : 'Your personal tutor is ready. Ask anything you are learning.'}
          </Text>
        ) : (
          messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === 'user' ? styles.userBubble : styles.aiBubble,
                m.role === 'user' && { backgroundColor: accent },
              ]}
            >
              {m.role === 'user' ? (
                <Text style={styles.userText}>{m.content}</Text>
              ) : (
                <FormattedReply text={m.content} />
              )}
            </View>
          ))
        )}

        {loading ? (
          <View style={[styles.bubble, styles.aiBubble, styles.typing]}>
            <ActivityIndicator color={colors.textMuted} size="small" />
            <Text style={styles.typingText}>Thinking…</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {empty ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestions}
          keyboardShouldPersistTaps="handled"
        >
          {SUGGESTIONS.map((s) => (
            <Pressable key={s} style={styles.chip} onPress={() => send(s)}>
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.inputBar}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={hasKey ? 'Ask the tutor…' : 'Add an AI key in Settings'}
          placeholderTextColor={colors.textFaint}
          editable={hasKey}
          multiline
          blurOnSubmit
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <Pressable
          onPress={() => send(input)}
          disabled={!input.trim() || loading}
          style={[
            styles.sendBtn,
            {
              backgroundColor:
                input.trim() && !loading ? accent : colors.surfaceAlt,
            },
          ]}
        >
          <Ionicons
            name="arrow-up"
            size={18}
            color={input.trim() && !loading ? colors.bg : colors.textFaint}
          />
        </Pressable>
      </View>
    </>
  );

  if (isFullscreen) {
    return (
      <KeyboardAvoidingView
        style={panelStyle}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 56}
      >
        {panelContent}
      </KeyboardAvoidingView>
    );
  }

  return <View style={panelStyle}>{panelContent}</View>;
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  panelFullscreen: { flex: 1, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  panelHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  panelSub: { color: colors.textFaint, fontSize: font.size.xs, maxWidth: 220 },
  closeBtn: { padding: 4 },

  messages: { flexGrow: 1, flexShrink: 1, minHeight: 80 },
  messagesContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  welcome: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    paddingVertical: spacing.sm,
  },
  bubble: {
    maxWidth: '92%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: radius.sm,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderBottomLeftRadius: radius.sm,
  },
  formatted: { gap: 4 },
  bulletRow: { flexDirection: 'row', gap: 6, paddingRight: spacing.sm },
  bulletDot: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 21 },
  userText: {
    color: colors.bg,
    fontSize: font.size.sm,
    lineHeight: 20,
    fontWeight: font.weight.medium as '500',
  },
  aiText: { color: colors.text, fontSize: font.size.sm, lineHeight: 21 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typingText: { color: colors.textMuted, fontSize: font.size.xs },
  error: { color: colors.danger, fontSize: font.size.xs, textAlign: 'center' },

  suggestions: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipText: { color: colors.textMuted, fontSize: font.size.xs, fontWeight: font.weight.semibold as '600' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.bgElevated,
  },
  input: {
    flex: 1,
    maxHeight: 88,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 6,
    color: colors.text,
    fontSize: font.size.sm,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
