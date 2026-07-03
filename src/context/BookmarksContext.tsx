import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { CardRef } from '@/types/content';

const STORAGE_KEY = 'microlearn.bookmarks.v1';

export interface Bookmark extends CardRef {
  savedAt: string; // ISO
}

interface BookmarksContextValue {
  hydrated: boolean;
  bookmarks: Bookmark[];
  isSaved: (id: string) => boolean;
  /** Toggle a card's saved state; returns the new state (true = now saved). */
  toggle: (ref: CardRef) => boolean;
  remove: (id: string) => void;
  count: number;
}

const BookmarksContext = createContext<BookmarksContextValue | undefined>(undefined);

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setBookmarks(JSON.parse(raw));
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const persist = useCallback((next: Bookmark[]) => {
    setBookmarks(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const toggle = useCallback<BookmarksContextValue['toggle']>(
    (ref) => {
      let nowSaved = false;
      setBookmarks((prev) => {
        const exists = prev.some((b) => b.id === ref.id);
        let next: Bookmark[];
        if (exists) {
          next = prev.filter((b) => b.id !== ref.id);
          nowSaved = false;
        } else {
          next = [{ ...ref, savedAt: new Date().toISOString() }, ...prev];
          nowSaved = true;
        }
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      return nowSaved;
    },
    [],
  );

  const remove = useCallback<BookmarksContextValue['remove']>(
    (id) => {
      setBookmarks((prev) => {
        const next = prev.filter((b) => b.id !== id);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const value = useMemo<BookmarksContextValue>(() => {
    const ids = new Set(bookmarks.map((b) => b.id));
    return {
      hydrated,
      bookmarks,
      isSaved: (id: string) => ids.has(id),
      toggle,
      remove,
      count: bookmarks.length,
    };
  }, [bookmarks, hydrated, toggle, remove]);

  return (
    <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>
  );
}

export function useBookmarks(): BookmarksContextValue {
  const ctx = useContext(BookmarksContext);
  if (!ctx) throw new Error('useBookmarks must be used within a BookmarksProvider');
  return ctx;
}
