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
import { useLibrary } from '@/context/LibraryContext';
import {
  isServerConfigured,
  requestServerTutorReply,
  ServerGenerationError,
} from '@/services/microlearnServer';
import { colors, font, radius, spacing } from '@/theme/theme';

type TutorMessage = { role: 'user' | 'assistant'; content: string };

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
  keyboardVerticalOffset?: number;
  onKeyboardChange?: (visible: boolean) => void;
}

export function TutorPanel({
  context,
  contextLabel,
  accent = colors.primary,
  variant = 'inline',
  onClose,
  maxHeight = 320,
  keyboardVerticalOffset,
  onKeyboardChange,
}: TutorPanelProps) {
  const insets = useSafeAreaInsets();
  const { serverConfigured } = useLibrary();
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = () => {
      setKeyboardUp(true);
      onKeyboardChange?.(true);
    };
    const onHide = () => {
      setKeyboardUp(false);
      onKeyboardChange?.(false);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [onKeyboardChange]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (!serverConfigured || !isServerConfigured()) {
      setError('Connect to the Microlearn server in Settings to chat with the tutor.');
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
      const reply = await requestServerTutorReply(history, context);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      const msg = e instanceof ServerGenerationError ? e.message : 'Something went wrong. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  };

  const empty = messages.length === 0;
  const isFullscreen = variant === 'fullscreen';
  const offset =
    keyboardVerticalOffset ?? (isFullscreen ? insets.top + 56 : insets.top + 48);

  return (
    <KeyboardAvoidingView
      style={[
        styles.panel,
        isFullscreen ? styles.panelFullscreen : { maxHeight },
        !isFullscreen && keyboardUp && styles.panelInlineKeyboard,
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
    >
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
        contentContainerStyle={[
          styles.messagesContent,
          keyboardUp && styles.messagesContentKeyboard,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {empty ? (
          <Text style={styles.welcome}>
            {contextLabel
              ? 'Ask about this slide — explanations, examples, or a quick quiz.'
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

      {empty && !keyboardUp ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.suggestionsRow}
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

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={serverConfigured ? 'Ask the tutor…' : 'Connect server in Settings'}
          placeholderTextColor={colors.textFaint}
          editable={serverConfigured}
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
    </KeyboardAvoidingView>
  );
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
  panelInlineKeyboard: { flex: 1, maxHeight: undefined },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexShrink: 0,
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

  messages: { flexGrow: 1, flexShrink: 1, minHeight: 72 },
  messagesContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  messagesContentKeyboard: { paddingBottom: spacing.md },
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

  suggestionsRow: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 42,
  },
  suggestions: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: 180,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
    lineHeight: 16,
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.bgElevated,
    flexShrink: 0,
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
