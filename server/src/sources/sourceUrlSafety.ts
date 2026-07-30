import dns from 'node:dns/promises';
import { SourceExtractionError } from './sourceTypes';

const BLOCKED_PROTOCOLS = new Set(['file:', 'ftp:', 'data:', 'javascript:']);
const EXPLICIT_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('fe80')) return true;
  return false;
}

function isBlockedHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (!lower) return true;
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  if (isPrivateIpv4(lower) || isPrivateIpv6(lower)) return true;
  return false;
}

function rejectUnsupportedProtocol(protocol: string): void {
  const normalized = protocol.toLowerCase();
  if (BLOCKED_PROTOCOLS.has(normalized)) {
    throw new SourceExtractionError('UNSUPPORTED_PROTOCOL', 'Only http and https URLs are allowed.');
  }
  if (normalized !== 'http:' && normalized !== 'https:') {
    throw new SourceExtractionError('UNSUPPORTED_PROTOCOL', 'Only http and https URLs are allowed.');
  }
}

function parseInputUrl(trimmed: string): URL {
  const hasExplicitScheme = EXPLICIT_SCHEME.test(trimmed);
  try {
    return new URL(hasExplicitScheme ? trimmed : `https://${trimmed}`);
  } catch {
    throw new SourceExtractionError('INVALID_URL', 'Enter a complete public URL.');
  }
}

/** Normalize arXiv abstract/pdf URLs to canonical PDF links. */
export function normalizeArxivUrl(parsed: URL): string {
  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith('arxiv.org')) return parsed.toString();

  const absMatch = parsed.pathname.match(/^\/abs\/(\d{4}\.\d{4,5}(v\d+)?)$/i);
  if (absMatch) {
    return `https://arxiv.org/pdf/${absMatch[1]}.pdf`;
  }

  const pdfMatch = parsed.pathname.match(/^\/pdf\/(\d{4}\.\d{4,5}(v\d+)?)(?:\.pdf)?$/i);
  if (pdfMatch) {
    return `https://arxiv.org/pdf/${pdfMatch[1]}.pdf`;
  }

  return parsed.toString();
}

export function normalizeSourceUrl(raw: string): { normalizedUrl: string; displayUrl: string } {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    throw new SourceExtractionError('INVALID_URL', 'Enter a complete public URL.');
  }

  const parsed = parseInputUrl(trimmed);
  rejectUnsupportedProtocol(parsed.protocol);

  if (parsed.username || parsed.password) {
    throw new SourceExtractionError('INVALID_URL', 'URLs with embedded credentials are not allowed.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isBlockedHost(hostname)) {
    throw new SourceExtractionError('PRIVATE_HOST', 'Local or private network URLs cannot be fetched.');
  }

  parsed.hash = '';
  const normalizedUrl = normalizeArxivUrl(parsed);
  return { normalizedUrl, displayUrl: trimmed };
}

/** Resolves hostname and rejects private addresses when practical. */
export async function assertPublicHost(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SourceExtractionError('INVALID_URL', 'Enter a complete public URL.');
  }

  rejectUnsupportedProtocol(parsed.protocol);

  const hostname = parsed.hostname;
  if (!hostname || isBlockedHost(hostname)) {
    throw new SourceExtractionError('PRIVATE_HOST', 'Local or private network URLs cannot be fetched.');
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
    return;
  }

  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    for (const entry of results) {
      if (isBlockedHost(entry.address)) {
        throw new SourceExtractionError('PRIVATE_HOST', 'URL resolves to a private or local address.');
      }
    }
  } catch (err) {
    if (err instanceof SourceExtractionError) throw err;
    // Prefetch is best-effort; fetch uses normalizedUrl and surfaces real network errors.
  }
}
