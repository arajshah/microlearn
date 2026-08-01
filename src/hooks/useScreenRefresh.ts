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

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const runRefresh = useCallback((): Promise<void> => {
    if (!enabled) return Promise.resolve();
    if (inFlightRef.current) return inFlightRef.current;

    if (mountedRef.current) setRefreshing(true);
    const request = Promise.resolve()
      .then(() => refreshRef.current())
      .finally(() => {
        if (inFlightRef.current === request) {
          inFlightRef.current = null;
          if (mountedRef.current) setRefreshing(false);
        }
      });
    inFlightRef.current = request;
    return request;
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      let appState = AppState.currentState;
      void runRefresh().catch(() => {});
      const subscription = AppState.addEventListener('change', (nextState) => {
        const wasBackgrounded = appState === 'background' || appState === 'inactive';
        appState = nextState;
        if (wasBackgrounded && nextState === 'active') void runRefresh().catch(() => {});
      });
      return () => subscription.remove();
    }, [enabled, runRefresh]),
  );

  return { refreshing, refresh: runRefresh };
}
