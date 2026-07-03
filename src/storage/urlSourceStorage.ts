import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExtractedUrlSource } from '@/types/urlSource';
import { cacheKeyForUrl } from '@/utils/urlValidation';

const STORAGE_KEY = 'microlearn.urlExtractions.v1';

type ExtractionIndex = Record<string, ExtractedUrlSource>;

async function readIndex(): Promise<ExtractionIndex> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ExtractionIndex;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeIndex(index: ExtractionIndex): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(index));
}

export async function saveUrlExtraction(source: ExtractedUrlSource): Promise<void> {
  const index = await readIndex();
  index[cacheKeyForUrl(source.originalUrl)] = source;
  await writeIndex(index);
}

export async function getUrlExtraction(url: string): Promise<ExtractedUrlSource | null> {
  const index = await readIndex();
  return index[cacheKeyForUrl(url)] ?? null;
}

export async function deleteUrlExtraction(url: string): Promise<void> {
  const index = await readIndex();
  delete index[cacheKeyForUrl(url)];
  await writeIndex(index);
}

export function makeExtractionId(): string {
  return `url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getUrlExtractionById(id: string): Promise<ExtractedUrlSource | null> {
  const index = await readIndex();
  return Object.values(index).find((e) => e.id === id) ?? null;
}
