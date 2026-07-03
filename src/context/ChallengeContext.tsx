import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { dayKey } from '@/utils/date';

const STORAGE_KEY = 'microlearn.challenge.v1';

export interface ChallengeResult {
  correct: number;
  total: number;
  xp: number;
  at: string; // ISO
}

interface ChallengeState {
  /** Keyed by YYYY-MM-DD. */
  history: Record<string, ChallengeResult>;
}

interface ChallengeContextValue {
  hydrated: boolean;
  isDoneToday: boolean;
  todayResult: ChallengeResult | undefined;
  completedCount: number;
  recordToday: (result: ChallengeResult) => void;
}

const ChallengeContext = createContext<ChallengeContextValue | undefined>(undefined);

export function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ChallengeState>({ history: {} });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState(JSON.parse(raw));
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const recordToday = useCallback<ChallengeContextValue['recordToday']>((result) => {
    setState((prev) => {
      const next: ChallengeState = {
        history: { ...prev.history, [dayKey()]: result },
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ChallengeContextValue>(() => {
    const today = dayKey();
    return {
      hydrated,
      isDoneToday: Boolean(state.history[today]),
      todayResult: state.history[today],
      completedCount: Object.keys(state.history).length,
      recordToday,
    };
  }, [state, hydrated, recordToday]);

  return (
    <ChallengeContext.Provider value={value}>{children}</ChallengeContext.Provider>
  );
}

export function useChallenge(): ChallengeContextValue {
  const ctx = useContext(ChallengeContext);
  if (!ctx) throw new Error('useChallenge must be used within a ChallengeProvider');
  return ctx;
}
