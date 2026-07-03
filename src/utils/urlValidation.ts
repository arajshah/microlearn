import {
  UrlExtractionErrorCode,
  UrlValidation,
} from '@/types/urlSource';

const UNSUPPORTED_HOST_PATTERNS: { pattern: RegExp; code: UrlExtractionErrorCode; message: string }[] = [
  {
    pattern: /(^|\.)docs\.google\.com$/i,
    code: 'UNSUPPORTED_SOURCE',
    message: 'Google Docs links are not supported. Paste the relevant text instead.',
  },
  {
    pattern: /(^|\.)drive\.google\.com$/i,
    code: 'UNSUPPORTED_SOURCE',
    message: 'Google Drive links are not supported. Use a direct public PDF link or paste the text.',
  },
  {
    pattern: /(^|\.)sheets\.google\.com$/i,
    code: 'UNSUPPORTED_SOURCE',
    message: 'Google Sheets links are not supported. Paste the relevant text instead.',
  },
  {
    pattern: /(^|\.)(youtube\.com|youtu\.be)$/i,
    code: 'UNSUPPORTED_SOURCE',
    message: 'YouTube links are not supported. Paste a transcript or enter the topic manually.',
  },
];

const UNSUPPORTED_PATH_EXT = /\.(mp4|mp3|wav|m4a|mov|avi|mkv|webm)(\?|$)/i;

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** True when the string looks like a URL, not arbitrary prose with a period. */
export function isUrlInput(value: string): boolean {
  const v = value.trim();
  if (!v || /\s/.test(v)) return false;
  if (/^https?:\/\//i.test(v)) return true;
  if (/^www\./i.test(v)) return true;
  return /^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(v);
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('INVALID_URL');
  }
  parsed.hash = '';
  return parsed.toString();
}

export function validatePublicUrl(value: string): UrlValidation {
  if (!isUrlInput(value)) {
    return {
      ok: false,
      code: 'INVALID_URL',
      message: 'Enter a complete public URL beginning with http:// or https://.',
    };
  }

  let normalized: string;
  try {
    normalized = normalizeUrl(value);
  } catch {
    return {
      ok: false,
      code: 'INVALID_URL',
      message: 'Enter a complete public URL beginning with http:// or https://.',
    };
  }

  const parsed = new URL(normalized);
  const host = parsed.hostname.toLowerCase();

  if (host === 'localhost' || host.endsWith('.localhost')) {
    return {
      ok: false,
      code: 'PRIVATE_URL',
      message: 'Local URLs cannot be read. Paste the text directly instead.',
    };
  }

  if (isPrivateIpv4(host)) {
    return {
      ok: false,
      code: 'PRIVATE_URL',
      message: 'Private network URLs cannot be read. Paste the text directly instead.',
    };
  }

  for (const rule of UNSUPPORTED_HOST_PATTERNS) {
    if (rule.pattern.test(host)) {
      return { ok: false, code: rule.code, message: rule.message };
    }
  }

  if (UNSUPPORTED_PATH_EXT.test(parsed.pathname)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_SOURCE',
      message: 'Audio and video links are not supported. Paste a transcript or enter the topic manually.',
    };
  }

  return {
    ok: true,
    normalized,
    displayUrl: value.trim(),
  };
}

export function cacheKeyForUrl(normalized: string): string {
  return normalized.toLowerCase();
}
