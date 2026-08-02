import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'microlearn.api.token';

let cached: string | null | undefined;

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getApiToken(): Promise<string> {
  if (cached !== undefined) return cached ?? '';

  try {
    const storage = webStorage();
    const stored = storage
      ? storage.getItem(TOKEN_KEY)
      : await SecureStore.getItemAsync(TOKEN_KEY);

    cached = stored?.trim() || null;
  } catch {
    cached = null;
  }

  return cached ?? '';
}

export async function saveApiToken(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) return clearApiToken();

  try {
    const storage = webStorage();

    if (storage) {
      storage.setItem(TOKEN_KEY, trimmed);
    } else {
      await SecureStore.setItemAsync(TOKEN_KEY, trimmed);
    }

    cached = trimmed;
    return true;
  } catch {
    return false;
  }
}

export async function clearApiToken(): Promise<boolean> {
  try {
    const storage = webStorage();

    if (storage) {
      storage.removeItem(TOKEN_KEY);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }

    cached = null;
    return true;
  } catch {
    return false;
  }
}

export async function hasApiToken(): Promise<boolean> {
  return (await getApiToken()).length > 0;
}
