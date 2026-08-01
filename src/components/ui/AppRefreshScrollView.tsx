import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, radius, shadow, spacing } from '@/theme/theme';

const PULL_RANGE = 88;

export interface AppRefreshConfig {
  refreshing: boolean;
  onRefresh: () => Promise<void> | void;
  accent?: string;
  indicatorTopOffset?: number;
}

export type AppRefreshScrollViewProps = ScrollViewProps & {
  refresh?: AppRefreshConfig;
};

/** ScrollView with one native refresh gesture and a distance-driven Microlearn indicator. */
export function AppRefreshScrollView({
  refresh,
  style,
  onScroll,
  onScrollBeginDrag,
  onScrollEndDrag,
  onTouchEnd,
  onTouchMove,
  onTouchStart,
  scrollEventThrottle,
  ...props
}: AppRefreshScrollViewProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const pullDistance = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const latestY = useRef(0);
  const touchStartY = useRef<number | null>(null);
  const requestRef = useRef<Promise<void> | null>(null);
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    if (!refresh?.refreshing || reduceMotion) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 760,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, refresh?.refreshing, spin]);

  useEffect(() => {
    if (refresh?.refreshing) {
      pullDistance.setValue(PULL_RANGE);
      return;
    }
    if (!pulling) {
      Animated.timing(pullDistance, {
        toValue: 0,
        duration: reduceMotion ? 0 : 180,
        useNativeDriver: true,
      }).start();
    }
  }, [pullDistance, pulling, reduceMotion, refresh?.refreshing]);

  const handleRefresh = useCallback(() => {
    if (!refresh || requestRef.current) return;
    const request = Promise.resolve()
      .then(() => refresh.onRefresh())
      .catch(() => {})
      .finally(() => {
        if (requestRef.current === request) requestRef.current = null;
      });
    requestRef.current = request;
  }, [refresh]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    latestY.current = y;
    const distance = Math.max(0, Math.min(PULL_RANGE, -y));
    if (!refresh?.refreshing && (y < 0 || touchStartY.current === null)) {
      pullDistance.setValue(distance);
      if (distance > 0 !== pulling) setPulling(distance > 0);
    }
    onScroll?.(event);
  }, [onScroll, pullDistance, pulling, refresh?.refreshing]);

  const handleBeginDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (latestY.current <= 0) setPulling(true);
    onScrollBeginDrag?.(event);
  }, [onScrollBeginDrag]);

  const handleEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPulling(false);
    onScrollEndDrag?.(event);
  }, [onScrollEndDrag]);

  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    touchStartY.current = latestY.current <= 0 ? event.nativeEvent.pageY : null;
    onTouchStart?.(event);
  }, [onTouchStart]);

  const handleTouchMove = useCallback((event: GestureResponderEvent) => {
    if (!refresh?.refreshing && touchStartY.current !== null) {
      const distance = Math.max(
        0,
        Math.min(PULL_RANGE, (event.nativeEvent.pageY - touchStartY.current) * 0.72),
      );
      pullDistance.setValue(distance);
      setPulling(distance > 0);
    }
    onTouchMove?.(event);
  }, [onTouchMove, pullDistance, refresh?.refreshing]);

  const handleTouchEnd = useCallback((event: GestureResponderEvent) => {
    touchStartY.current = null;
    setPulling(false);
    onTouchEnd?.(event);
  }, [onTouchEnd]);

  if (!refresh) {
    return (
      <ScrollView
        {...props}
        style={style}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        scrollEventThrottle={scrollEventThrottle}
      />
    );
  }

  const progress = pullDistance.interpolate({
    inputRange: [0, PULL_RANGE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const pullRotation = pullDistance.interpolate({
    inputRange: [0, PULL_RANGE],
    outputRange: ['0deg', '240deg'],
    extrapolate: 'clamp',
  });
  const spinRotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const accent = refresh.accent ?? colors.primary;
  const indicatorTop = refresh.indicatorTopOffset ?? insets.top + spacing.sm;

  return (
    <View style={[styles.container, style]}>
      <ScrollView
        {...props}
        style={styles.scroll}
        refreshControl={(
          <RefreshControl
            refreshing={refresh.refreshing}
            onRefresh={handleRefresh}
            tintColor="transparent"
            colors={['transparent']}
            progressBackgroundColor="transparent"
            progressViewOffset={indicatorTop}
          />
        )}
        onScroll={handleScroll}
        onScrollBeginDrag={handleBeginDrag}
        onScrollEndDrag={handleEndDrag}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        scrollEventThrottle={scrollEventThrottle ?? 16}
      />
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.indicator,
          {
            top: indicatorTop,
            borderColor: `${accent}88`,
            opacity: refresh.refreshing ? 1 : progress,
            transform: [
              {
                scale: refresh.refreshing
                  ? 1
                  : progress.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }),
              },
            ],
          },
        ]}
      >
        <Animated.View
          style={{
            transform: [
              {
                rotate: reduceMotion
                  ? '0deg'
                  : refresh.refreshing
                    ? spinRotation
                    : pullRotation,
              },
            ],
          }}
        >
          <Ionicons name="refresh" size={20} color={accent} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  indicator: {
    position: 'absolute',
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
    zIndex: 10,
    elevation: 4,
  },
});
