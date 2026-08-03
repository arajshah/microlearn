import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme/theme';
import { TutorConversation, type TutorConversationProps } from './TutorConversation';
import {
  computeSnapHeights,
  computeUsableHeight,
  nearestSnap,
  nextSnap,
  resolveSheetHeight,
  type TutorSnapId,
  usableHeightAboveKeyboard,
} from './tutorLayout';
import type { TutorConversationState } from './useTutorConversation';

const SPRING = { damping: 22, stiffness: 220, mass: 0.9 };

export interface TutorSheetProps {
  visible: boolean;
  onClose: () => void;
  conversation: TutorConversationState;
  accent?: string;
  contextLabel?: string | null;
  cardLabel?: string | null;
  /** Notify parent when keyboard visibility changes (e.g. hide lesson footer). */
  onKeyboardChange?: (visible: boolean) => void;
}

/**
 * Inline lesson tutor as a resizable bottom sheet.
 * Owns keyboard avoidance for the lesson tutor path (no nested KAV).
 */
export function TutorSheet({
  visible,
  onClose,
  conversation,
  accent,
  contextLabel,
  cardLabel,
  onKeyboardChange,
}: TutorSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [snap, setSnap] = useState<TutorSnapId>('compact');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Prefer measured host height (lesson body) so "full" truly fills available space.
  const usable = useMemo(() => {
    if (containerHeight > 0) {
      return Math.max(220, Math.round(containerHeight));
    }
    return computeUsableHeight(windowHeight, insets.top);
  }, [containerHeight, windowHeight, insets.top]);
  const snaps = useMemo(() => computeSnapHeights(usable), [usable]);

  // Lift the sheet with the keyboard frame. Height is capped to remaining space.
  const keyboardLift = Platform.OS === 'web' ? 0 : keyboardHeight;
  const maxAvailable = useMemo(() => {
    if (containerHeight > 0) {
      return Math.max(220, Math.round(containerHeight - keyboardLift));
    }
    return usableHeightAboveKeyboard(windowHeight, insets.top, keyboardLift);
  }, [containerHeight, windowHeight, insets.top, keyboardLift]);

  const resolved = useMemo(
    () =>
      resolveSheetHeight({
        snap,
        snaps,
        maxAvailable,
        keyboardVisible: keyboardLift > 0,
      }),
    [snap, snaps, maxAvailable, keyboardLift],
  );

  const heightSV = useSharedValue(snaps.compact);
  const bottomSV = useSharedValue(0);
  const dragStartHeight = useSharedValue(snaps.compact);
  const closing = useSharedValue(false);
  const maxAvailableSV = useSharedValue(maxAvailable);
  const compactSV = useSharedValue(snaps.compact);

  useEffect(() => {
    maxAvailableSV.value = maxAvailable;
    compactSV.value = snaps.compact;
  }, [maxAvailable, snaps.compact, maxAvailableSV, compactSV]);

  const applyHeight = useCallback(
    (nextSnap: TutorSnapId, animated: boolean) => {
      const next = resolveSheetHeight({
        snap: nextSnap,
        snaps,
        maxAvailable,
        keyboardVisible: keyboardLift > 0,
      });
      setSnap(next.snap);
      if (animated) {
        heightSV.value = withSpring(next.height, SPRING);
      } else {
        heightSV.value = next.height;
      }
    },
    [snaps, maxAvailable, keyboardLift, heightSV],
  );

  // Sync height / bottom lift when snaps / keyboard / visibility change.
  useEffect(() => {
    if (!visible) return;
    heightSV.value = withSpring(resolved.height, SPRING);
    bottomSV.value = withSpring(keyboardLift, SPRING);
    if (resolved.snap !== snap) setSnap(resolved.snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drive from resolved metrics
  }, [visible, resolved.height, keyboardLift, maxAvailable]);

  useEffect(() => {
    if (!visible) {
      cancelAnimation(heightSV);
      cancelAnimation(bottomSV);
      closing.value = false;
      setSnap('compact');
      heightSV.value = snaps.compact;
      bottomSV.value = 0;
    }
  }, [visible, heightSV, bottomSV, closing, snaps.compact]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: { endCoordinates?: { height?: number } }) => {
      const h = Math.max(0, Math.round(e.endCoordinates?.height ?? 0));
      setKeyboardHeight(h);
      onKeyboardChange?.(true);
      setSnap((current) => (current === 'compact' ? 'expanded' : current));
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

  const finishClose = useCallback(() => {
    Keyboard.dismiss();
    cancelAnimation(heightSV);
    cancelAnimation(bottomSV);
    closing.value = false;
    onKeyboardChange?.(false);
    setKeyboardHeight(0);
    onClose();
  }, [heightSV, bottomSV, closing, onClose, onKeyboardChange]);

  const handleClose = useCallback(() => {
    if (closing.value) return;
    closing.value = true;
    Keyboard.dismiss();
    cancelAnimation(heightSV);
    finishClose();
  }, [closing, heightSV, finishClose]);

  const snapToNearest = useCallback(
    (height: number) => {
      const id = nearestSnap(height, {
        compact: Math.min(snaps.compact, maxAvailable),
        expanded: Math.min(snaps.expanded, maxAvailable),
        full: Math.min(snaps.full, maxAvailable),
      });
      applyHeight(id, true);
    },
    [snaps, maxAvailable, applyHeight],
  );

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      cancelAnimation(heightSV);
      dragStartHeight.value = heightSV.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = Math.min(
        maxAvailableSV.value,
        Math.max(160, dragStartHeight.value - e.translationY),
      );
      heightSV.value = next;
    })
    .onEnd((e) => {
      'worklet';
      const projected = heightSV.value - e.velocityY * 0.08;
      // Drag far down past compact → close.
      if (projected < compactSV.value * 0.55 && e.velocityY > 400) {
        runOnJS(handleClose)();
        return;
      }
      runOnJS(snapToNearest)(projected);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    height: heightSV.value,
    bottom: bottomSV.value,
  }));

  const expand = () => applyHeight(nextSnap(snap, 'expand'), true);
  const collapse = () => {
    if (snap === 'compact') {
      handleClose();
      return;
    }
    applyHeight(nextSnap(snap, 'collapse'), true);
  };

  const snapControls: TutorConversationProps['snapControls'] = {
    canExpand: snap !== 'full',
    canCollapse: true,
    onExpand: expand,
    onCollapse: collapse,
  };

  // Parent owns conversation state; this only controls presentation.
  if (!visible) return null;

  const composerInset =
    keyboardLift > 0 ? spacing.sm : Math.max(insets.bottom, spacing.sm);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== containerHeight) setContainerHeight(h);
      }}
    >
      <Pressable
        style={styles.backdrop}
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss tutor"
      />
      <Animated.View style={[styles.sheet, sheetStyle]} accessibilityViewIsModal>
        <GestureDetector gesture={pan}>
          <View
            style={styles.handleZone}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Resize tutor panel"
            accessibilityActions={[
              { name: 'increment', label: 'Expand' },
              { name: 'decrement', label: 'Collapse' },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'increment') expand();
              if (event.nativeEvent.actionName === 'decrement') collapse();
            }}
          >
            <View style={styles.handle} />
          </View>
        </GestureDetector>

        <TutorConversation
          conversation={conversation}
          accent={accent}
          contextLabel={contextLabel}
          cardLabel={cardLabel}
          composerBottomInset={composerInset}
          showSuggestions={keyboardHeight === 0}
          onClose={handleClose}
          snapControls={snapControls}
          hideHeaderChrome
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 8, 16, 0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    overflow: 'hidden',
    // Elevate above lesson content
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handleZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    minHeight: 28,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.textFaint,
  },
});
