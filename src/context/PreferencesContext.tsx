import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { MasteryLevel, normalizeMasteryLevel } from '@/data/mastery';
import { SubjectId } from '@/types/content';

const STORAGE_KEY = 'microlearn.prefs.v1';

interface PreferencesState {
  onboarded: boolean;
  level: MasteryLevel;
  interests: SubjectId[];
}

interface PreferencesContextValue extends PreferencesState {
  hydrated: boolean;
  completeOnboarding: (level: MasteryLevel, interests: SubjectId[]) => void;
  skipOnboarding: () => void;
  resetOnboarding: () => void;
}

const defaultState: PreferencesState = {
  onboarded: false,
  level: 3,
  interests: [],
};

function hydrateState(raw: string | null): PreferencesState {
  if (!raw) return defaultState;
  try {
    const parsed = JSON.parse(raw);
    return {
      onboarded: Boolean(parsed.onboarded),
      level: normalizeMasteryLevel(parsed.level),
      interests: Array.isArray(parsed.interests) ? parsed.interests : [],
    };
  } catch {
    return defaultState;
  }
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(
  undefined,
);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PreferencesState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        setState(hydrateState(raw));
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const persist = useCallback((next: PreferencesState) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const completeOnboarding = useCallback<PreferencesContextValue['completeOnboarding']>(
    (level, interests) => persist({ onboarded: true, level, interests }),
    [persist],
  );

  const skipOnboarding = useCallback(
    () => persist({ ...defaultState, onboarded: true }),
    [persist],
  );

  const resetOnboarding = useCallback(
    () => persist(defaultState),
    [persist],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...state,
      hydrated,
      completeOnboarding,
      skipOnboarding,
      resetOnboarding,
    }),
    [state, hydrated, completeOnboarding, skipOnboarding, resetOnboarding],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
