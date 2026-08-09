import { head, put } from '@vercel/blob';
import { blobToken } from './blobToken';
import {
  addEntry,
  CACHE_PATHNAME,
  canWriteBack,
  entryFromAnswer,
  isCacheEntry,
  type CacheEntry,
} from './cache';
import type { SlideFormat } from './slides';

/**
 * The cache's IO half. Server-only. Every path degrades to "no cache": a
 * missing token, a 404, corrupt JSON — the AI answers as if this file did
 * not exist. Nothing here may throw into the route.
 */

const TTL_MS = 60_000;

let memory: { at: number; entries: CacheEntry[] } | null = null;
let lastHitPersist = 0;

function hasToken(): boolean {
  return Boolean(blobToken());
}

async function fetchIndex(): Promise<CacheEntry[]> {
  const meta = await head(CACHE_PATHNAME, { token: blobToken() });
  const response = await fetch(meta.downloadUrl);
  if (!response.ok) return [];
  const parsed = (await response.json()) as { entries?: unknown[] };
  if (!Array.isArray(parsed?.entries)) return [];
  return parsed.entries.filter(isCacheEntry);
}

export async function loadCacheEntries(): Promise<CacheEntry[]> {
  if (!hasToken()) return [];
  const now = Date.now();
  if (memory && now - memory.at < TTL_MS) return memory.entries;
  try {
    const entries = await fetchIndex();
    memory = { at: now, entries };
    return entries;
  } catch {
    // 404 on first ever run, network trouble, corrupt JSON — all the same:
    // no cache this request. Keep a short-lived empty memory so a hard-down
    // blob store is not re-fetched on every request.
    memory = { at: now, entries: [] };
    return [];
  }
}

function persist(entries: CacheEntry[]): Promise<unknown> {
  memory = { at: Date.now(), entries };
  return put(CACHE_PATHNAME, JSON.stringify({ version: 1, entries }), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
    allowOverwrite: true,
    token: blobToken(),
  }).catch((err) => console.error('cacheStore: persist failed', err));
}

/**
 * Hit bookkeeping. Counts always move in memory; the blob write is throttled
 * to once per TTL window so a burst of hits cannot turn into a burst of PUTs.
 */
export function serveHitEffects(entry: CacheEntry): void {
  entry.hits += 1;
  if (!hasToken() || !memory) return;
  const now = Date.now();
  if (now - lastHitPersist < TTL_MS) return;
  lastHitPersist = now;
  void persist(memory.entries);
}

export async function writeBackAnswer(
  question: string,
  format: SlideFormat,
  answer: string,
  recap: string | null,
): Promise<void> {
  if (!hasToken()) return;
  // Write-back serves one visitor's answer to the next, so it needs an off
  // switch that does not require a deploy of new code: set ASK_CACHE_WRITEBACK
  // to "off" and the cache becomes seeds-only, still serving instantly.
  if (process.env.ASK_CACHE_WRITEBACK === 'off') return;
  try {
    const entries = await loadCacheEntries();
    const entry = entryFromAnswer(question, format, answer, recap);
    const grown = addEntry(entries, entry);
    if (grown === entries) return; // phrasing collision — nothing new to save
    await persist(grown);
  } catch (err) {
    console.error('cacheStore: write-back failed', err);
  }
}

export { canWriteBack };
