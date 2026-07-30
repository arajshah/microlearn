import * as SecureStore from 'expo-secure-store';

/**
 * Runtime storage for the Microlearn server bearer token.
 *
 * The token used to arrive via EXPO_PUBLIC_MICROLEARN_API_TOKEN, which Expo inlines
 * into the client bundle. It now lives only in the device keychain, entered by the
 * user in Settings. The value is never logged and is never read back into the UI.
 */

const TOKEN_KEY = 'microlearn.api.token';

/**
 * Avoids a keychain read on every request. `undefined` means "not loaded yet";
 * `null` means "loaded, and there is no token".
 */
let cached: string | null | undefined;

/** Returns the stored token, or '' when none is set or the keychain is unavailable. */
export async function getApiToken(): Promise<string> {
  if (cached !== undefined) return cached ?? '';
  try {
    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    cached = stored && stored.trim().length > 0 ? stored.trim() : null;
  } catch {
    // SecureStore is unavailable on web; behave as if no token were configured.
    cached = null;
  }
  return cached ?? '';
}

/** Persists a token. An empty/whitespace value clears it instead. Returns false if storage failed. */
export async function saveApiToken(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) return clearApiToken();
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, trimmed);
    cached = trimmed;
    return true;
  } catch {
    return false;
  }
}

/** Removes the stored token. Returns false if storage failed. */
export async function clearApiToken(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    cached = null;
    return true;
  } catch {
    return false;
  }
}

/** Whether a token is saved, without exposing its value. */
export async function hasApiToken(): Promise<boolean> {
  return (await getApiToken()).length > 0;
}
