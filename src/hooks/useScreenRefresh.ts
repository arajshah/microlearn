import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** Single-flight refresh lifecycle for focus, foreground, and pull gestures. */
export function useScreenRefresh(
  refresh: () => Promise<void>,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runRefresh = useCallback((showIndicator: boolean): Promise<void> => {
    if (!enabled) return Promise.resolve();
    if (showIndicator && mountedRef.current) setRefreshing(true);
    if (inFlightRef.current) return inFlightRef.current;

    if (mountedRef.current) setIsRefreshing(true);
    const request = Promise.resolve()
      .then(() => refreshRef.current())
      .finally(() => {
        if (inFlightRef.current === request) {
          inFlightRef.current = null;
          if (mountedRef.current) {
            setRefreshing(false);
            setIsRefreshing(false);
          }
        }
      });
    inFlightRef.current = request;
    return request;
  }, [enabled]);

  const refreshManually = useCallback(() => runRefresh(true), [runRefresh]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      let appState = AppState.currentState;
      void runRefresh(false).catch(() => {});
      const subscription = AppState.addEventListener('change', (nextState) => {
        const wasBackgrounded = appState === 'background' || appState === 'inactive';
        appState = nextState;
        if (wasBackgrounded && nextState === 'active') void runRefresh(false).catch(() => {});
      });
      return () => subscription.remove();
    }, [enabled, runRefresh]),
  );

  return { refreshing, isRefreshing, refresh: refreshManually };
}
