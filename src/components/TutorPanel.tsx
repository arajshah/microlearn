import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibrary } from '@/context/LibraryContext';
import { colors, spacing } from '@/theme/theme';
import { TutorConversation } from '@/components/tutor/TutorConversation';
import { useTutorConversation } from '@/components/tutor/useTutorConversation';

export interface TutorPanelProps {
  context?: string;
  contextLabel?: string | null;
  cardLabel?: string | null;
  accent?: string;
  /** Full-screen route presentation (not a bottom sheet). */
  variant?: 'inline' | 'fullscreen';
  onClose?: () => void;
  sessionKey?: string;
  onKeyboardChange?: (visible: boolean) => void;
}

/**
 * Shared full-screen tutor surface (also usable as a non-sheet panel).
 * Inline lesson presentation should use TutorSheet instead.
 */
export function TutorPanel({
  context,
  contextLabel,
  cardLabel,
  accent = colors.primary,
  variant = 'fullscreen',
  onClose,
  sessionKey,
  onKeyboardChange,
}: TutorPanelProps) {
  const insets = useSafeAreaInsets();
  const { serverConfigured } = useLibrary();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const conversation = useTutorConversation({
    context,
    serverConfigured,
    sessionKey,
  });

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: { endCoordinates?: { height?: number } }) => {
      const h = Math.max(0, Math.round(e.endCoordinates?.height ?? 0));
      setKeyboardHeight(h);
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

  // Single keyboard owner for the fullscreen route: pad the composer by keyboard frame.
  const composerInset =
    keyboardHeight > 0
      ? Math.max(spacing.sm, Platform.OS === 'ios' ? spacing.sm : spacing.sm)
      : Math.max(insets.bottom, spacing.sm);

  return (
    <View
      style={[
        styles.panel,
        variant === 'fullscreen' && styles.panelFullscreen,
        keyboardHeight > 0 && Platform.OS === 'ios' ? { paddingBottom: keyboardHeight } : null,
      ]}
    >
      <TutorConversation
        conversation={conversation}
        accent={accent}
        contextLabel={contextLabel}
        cardLabel={cardLabel}
        composerBottomInset={composerInset}
        showSuggestions={keyboardHeight === 0}
        onClose={onClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    overflow: 'hidden',
    flex: 1,
  },
  panelFullscreen: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
  },
});
