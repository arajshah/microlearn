import { AiConfig } from '@/types/content';

const ENV_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

/** Resolve the Google API key for Gemini-native features (URL Context). */
export function resolveGeminiApiKey(config: AiConfig): string {
  if (config.baseUrl.includes('generativelanguage.googleapis.com') && config.apiKey) {
    return config.apiKey;
  }
  return ENV_KEY || config.apiKey;
}
