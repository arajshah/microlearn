export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  exampleModels: string[];
  keyUrl: string;
  notes: string;
}

/**
 * OpenAI-compatible inference providers that host open-source models.
 * You only need a base URL + model + API key — swapping providers is just
 * changing these values in Settings.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'google',
    label: 'Google (Gemini / Gemma)',
    // Google's OpenAI-compatibility endpoint.
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemma-4-31b-it',
    exampleModels: [
      'gemma-4-31b-it',
      'gemma-4-26b-it',
      'gemini-flash-lite-latest',
      'gemini-flash-latest',
    ],
    keyUrl: 'https://aistudio.google.com/apikey',
    notes:
      'Best free quotas for this app: ~500 req/day on Gemini Flash-Lite and ~1,500 req/day on Gemma 4 (26B/31B), with no token-per-minute cap on Gemma. Use Flash-Lite for everyday lessons; Gemma 4 31B when a topic needs deeper reasoning. If a model ID is rejected, check your model list in AI Studio.',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    exampleModels: [
      'openai/gpt-oss-120b',
      'qwen/qwen3-32b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ],
    keyUrl: 'https://console.groq.com/keys',
    notes:
      'Extremely fast inference and a strong free tier (~1,000 req/day on the big models). GPT-OSS 120B supports reasoning + JSON; great as a fallback provider.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    exampleModels: [
      'meta-llama/llama-3.3-70b-instruct',
      'qwen/qwen-2.5-72b-instruct',
      'deepseek/deepseek-chat',
    ],
    keyUrl: 'https://openrouter.ai/keys',
    notes: 'One key, many open models. Some are free.',
  },
  {
    id: 'together',
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    exampleModels: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'Qwen/Qwen2.5-72B-Instruct-Turbo',
    ],
    keyUrl: 'https://api.together.xyz/settings/api-keys',
    notes: 'Large model selection, cheap pay-as-you-go.',
  },
  {
    id: 'custom',
    label: 'Custom / self-hosted',
    baseUrl: '',
    defaultModel: '',
    exampleModels: [],
    keyUrl: '',
    notes: 'Any OpenAI-compatible endpoint (e.g. vLLM, Ollama, LM Studio).',
  },
];

export const DEFAULT_PROVIDER = PROVIDER_PRESETS[0];
