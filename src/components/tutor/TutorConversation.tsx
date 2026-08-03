import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';
import { formatTutorReply, type TutorReplyBlock } from './formatTutorReply';
import type { TutorConversationState, TutorMessage } from './useTutorConversation';

const SUGGESTIONS = [
  'Explain this simply',
  'Give me an example',
  'Why does this matter?',
  'Quiz me on this',
];

function FormattedReply({ text }: { text: string }) {
  const blocks = formatTutorReply(text);
  if (blocks.length === 0) {
    return (
      <Text style={styles.aiText} selectable>
        {text}
      </Text>
    );
  }
  return (
    <View style={styles.formatted}>
      {blocks.map((block) => (
        <ReplyBlock key={block.key} block={block} />
      ))}
    </View>
  );
}

function ReplyBlock({ block }: { block: TutorReplyBlock }) {
  switch (block.type) {
    case 'bullet':
      return (
        <View style={styles.bulletRow}>
          <Text style={styles.bulletDot} accessible={false}>
            •
          </Text>
          <Text style={styles.aiText} selectable>
            {block.text}
          </Text>
        </View>
      );
    case 'numbered':
      return (
        <View style={styles.bulletRow}>
          <Text style={styles.bulletDot} accessible={false}>
            {block.index}.
          </Text>
          <Text style={styles.aiText} selectable>
            {block.text}
          </Text>
        </View>
      );
    case 'code':
      return (
        <View style={styles.codeBlock} accessibilityRole="text">
          <Text style={styles.codeText} selectable>
            {block.text}
          </Text>
        </View>
      );
    default:
      return (
        <Text style={styles.aiText} selectable>
          {block.text}
        </Text>
      );
  }
}

function MessageBubble({
  message,
  accent,
}: {
  message: TutorMessage;
  accent: string;
}) {
  const isUser = message.role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.aiBubble,
        isUser && { backgroundColor: accent },
      ]}
      accessibilityRole="text"
      accessibilityLabel={isUser ? `You said: ${message.content}` : `Tutor: ${message.content}`}
    >
      {isUser ? (
        <Text style={styles.userText} selectable>
          {message.content}
        </Text>
      ) : (
        <FormattedReply text={message.content} />
      )}
    </View>
  );
}

export interface TutorConversationProps {
  conversation: TutorConversationState;
  accent?: string;
  contextLabel?: string | null;
  cardLabel?: string | null;
  /** Bottom inset for the composer (safe area and/or keyboard handled by parent). */
  composerBottomInset?: number;
  showSuggestions?: boolean;
  onClose?: () => void;
  /** Expand/collapse controls for sheet presentation. */
  snapControls?: {
    canExpand: boolean;
    canCollapse: boolean;
    onExpand: () => void;
    onCollapse: () => void;
  };
  /** When true, header shows drag handle area already provided by parent. */
  hideHeaderChrome?: boolean;
  headerAccessory?: React.ReactNode;
}

export function TutorConversation({
  conversation,
  accent = colors.primary,
  contextLabel,
  cardLabel,
  composerBottomInset = spacing.sm,
  showSuggestions = true,
  onClose,
  snapControls,
  hideHeaderChrome = false,
  headerAccessory,
}: TutorConversationProps) {
  const {
    messages,
    input,
    setInput,
    loading,
    error,
    canRetry,
    serverConfigured,
    send,
    retry,
    clear,
    scrollReason,
    acknowledgeScroll,
  } = conversation;

  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const submitLock = useRef(false);

  const empty = messages.length === 0;

  useEffect(() => {
    if (!scrollReason) return;
    if (!pinnedToBottom && scrollReason !== 'user-send') {
      acknowledgeScroll();
      return;
    }
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
      acknowledgeScroll();
    });
    return () => cancelAnimationFrame(id);
  }, [scrollReason, pinnedToBottom, acknowledgeScroll, messages.length, loading]);

  useEffect(() => {
    if (!loading) return;
    AccessibilityInfo.announceForAccessibility?.('Tutor is thinking');
  }, [loading]);

  useEffect(() => {
    if (!error) return;
    AccessibilityInfo.announceForAccessibility?.(error);
  }, [error]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') {
      AccessibilityInfo.announceForAccessibility?.('New tutor reply');
    }
  }, [messages]);

  const handleSend = (text?: string) => {
    if (submitLock.current || loading) return;
    const value = (text ?? input).trim();
    if (!value) return;
    submitLock.current = true;
    setPinnedToBottom(true);
    send(value);
    // Keep keyboard open; unlock on next tick after state settles.
    requestAnimationFrame(() => {
      submitLock.current = false;
    });
  };

  const confirmClear = () => {
    if (messages.length === 0) return;
    Alert.alert('Clear conversation?', 'This removes the current tutor chat for this lesson.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => clear(),
      },
    ]);
  };

  const subtitle = cardLabel
    ? `on “${contextLabel ?? 'this lesson'}” · ${cardLabel}`
    : contextLabel
      ? `on “${contextLabel}”`
      : 'Ask while you read';

  return (
    <View style={styles.root} accessibilityLabel="AI Tutor conversation">
      {!hideHeaderChrome ? (
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderLeft}>
            <View style={[styles.badge, { backgroundColor: `${accent}22` }]}>
              <Ionicons name="sparkles" size={14} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelTitle}>AI Tutor</Text>
              <Text style={styles.panelSub} numberOfLines={2}>
                {subtitle}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {snapControls ? (
              <>
                <Pressable
                  onPress={snapControls.onCollapse}
                  disabled={!snapControls.canCollapse}
                  hitSlop={8}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Collapse tutor"
                >
                  <Ionicons
                    name="remove"
                    size={20}
                    color={snapControls.canCollapse ? colors.textMuted : colors.textFaint}
                  />
                </Pressable>
                <Pressable
                  onPress={snapControls.onExpand}
                  disabled={!snapControls.canExpand}
                  hitSlop={8}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Expand tutor"
                >
                  <Ionicons
                    name="expand"
                    size={18}
                    color={snapControls.canExpand ? colors.textMuted : colors.textFaint}
                  />
                </Pressable>
              </>
            ) : null}
            {messages.length > 0 ? (
              <Pressable
                onPress={confirmClear}
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear conversation"
              >
                <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
            {onClose ? (
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Close tutor"
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.sheetTitleRow}>
          <View style={styles.panelHeaderLeft}>
            <View style={[styles.badge, { backgroundColor: `${accent}22` }]}>
              <Ionicons name="sparkles" size={14} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelTitle}>AI Tutor</Text>
              <Text style={styles.panelSub} numberOfLines={2}>
                {subtitle}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {headerAccessory}
            {snapControls ? (
              <>
                <Pressable
                  onPress={snapControls.onCollapse}
                  disabled={!snapControls.canCollapse}
                  hitSlop={8}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Collapse tutor"
                >
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color={snapControls.canCollapse ? colors.textMuted : colors.textFaint}
                  />
                </Pressable>
                <Pressable
                  onPress={snapControls.onExpand}
                  disabled={!snapControls.canExpand}
                  hitSlop={8}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Expand tutor"
                >
                  <Ionicons
                    name="chevron-up"
                    size={20}
                    color={snapControls.canExpand ? colors.textMuted : colors.textFaint}
                  />
                </Pressable>
              </>
            ) : null}
            {messages.length > 0 ? (
              <Pressable
                onPress={confirmClear}
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear conversation"
              >
                <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
            {onClose ? (
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Close tutor"
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScrollBeginDrag={() => setPinnedToBottom(false)}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const distance =
            contentSize.height - layoutMeasurement.height - contentOffset.y;
          setPinnedToBottom(distance < 80);
        }}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (pinnedToBottom || scrollReason) {
            scrollRef.current?.scrollToEnd({ animated: true });
          }
        }}
      >
        {empty ? (
          <Text style={styles.welcome}>
            {contextLabel
              ? 'Ask about this slide — explanations, examples, or a quick quiz.'
              : 'Your personal tutor is ready. Ask anything you are learning.'}
          </Text>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} accent={accent} />)
        )}

        {loading ? (
          <View
            style={[styles.bubble, styles.aiBubble, styles.typing]}
            accessibilityLiveRegion="polite"
            accessibilityLabel="Tutor is thinking"
          >
            <ActivityIndicator color={colors.textMuted} size="small" />
            <Text style={styles.typingText}>Thinking…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorRow} accessibilityLiveRegion="assertive">
            <Text style={styles.error}>{error}</Text>
            {canRetry ? (
              <Pressable
                onPress={retry}
                style={styles.retryBtn}
                accessibilityRole="button"
                accessibilityLabel="Retry last message"
              >
                <Text style={[styles.retryText, { color: accent }]}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {empty && showSuggestions ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.suggestionsRow}
          contentContainerStyle={styles.suggestions}
          keyboardShouldPersistTaps="handled"
        >
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              style={styles.chip}
              onPress={() => handleSend(s)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={s}
            >
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={[styles.inputBar, { paddingBottom: Math.max(composerBottomInset, spacing.sm) }]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={
            serverConfigured ? 'Ask the tutor…' : 'Connect server in Settings'
          }
          placeholderTextColor={colors.textFaint}
          editable={serverConfigured && !loading}
          multiline
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (Platform.OS === 'ios' && input.includes('\n')) return;
            handleSend();
          }}
          returnKeyType="send"
          accessibilityLabel="Message the tutor"
        />
        <Pressable
          onPress={() => handleSend()}
          disabled={!serverConfigured || !input.trim() || loading}
          style={[
            styles.sendBtn,
            {
              backgroundColor:
                serverConfigured && input.trim() && !loading ? accent : colors.surfaceAlt,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !serverConfigured || !input.trim() || loading }}
        >
          <Ionicons
            name="arrow-up"
            size={18}
            color={
              serverConfigured && input.trim() && !loading ? colors.bg : colors.textFaint
            }
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexShrink: 0,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
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
  panelSub: { color: colors.textFaint, fontSize: font.size.xs, maxWidth: 240 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  messages: { flexGrow: 1, flexShrink: 1, minHeight: 72 },
  messagesContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    flexGrow: 1,
  },
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
  formatted: { gap: 8 },
  bulletRow: { flexDirection: 'row', gap: 6, paddingRight: spacing.sm },
  bulletDot: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 21, minWidth: 16 },
  userText: {
    color: colors.bg,
    fontSize: font.size.sm,
    lineHeight: 20,
    fontWeight: font.weight.medium as '500',
  },
  aiText: { color: colors.text, fontSize: font.size.sm, lineHeight: 21, flexShrink: 1 },
  codeBlock: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: 2,
  },
  codeText: {
    color: colors.text,
    fontSize: font.size.xs,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  typing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typingText: { color: colors.textMuted, fontSize: font.size.xs },
  errorRow: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  error: { color: colors.danger, fontSize: font.size.xs, textAlign: 'center' },
  retryBtn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: font.size.sm, fontWeight: font.weight.semibold as '600' },

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
    minHeight: 32,
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
    maxHeight: 120,
    minHeight: 40,
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
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
