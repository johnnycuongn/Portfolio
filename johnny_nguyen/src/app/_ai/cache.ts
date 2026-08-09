import type { SlideFormat } from './slides';

/**
 * The /ask answer cache's pure half: entry shape, question matching, and the
 * write-back gate. No IO here — this module is shared with check scripts and
 * must stay importable anywhere.
 */

export const CACHE_PATHNAME = 'ask-cache/v1.json';
export const MAX_CACHE_ENTRIES = 200;

/** Questions this short are conversational glue, never cacheable lookups. */
const MIN_QUESTION_CHARS = 8;
const MAX_QUESTION_CHARS = 120;
const MAX_ANSWER_CHARS = 600;

export interface CacheEntry {
  id: string;
  /** Normalized exact question strings that map straight to this answer. */
  phrasings: string[];
  /** Content words for scored matching when no phrasing matches exactly. */
  keywords: string[];
  format: SlideFormat;
  /** Slide body text: headline line, then item lines. */
  answer: string;
  action: 'resume' | 'contact-form' | null;
  recap: string;
  /** Seeds are never evicted and the seeder never overwrites them. */
  seeded: boolean;
  hits: number;
  updatedAt: number;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'about', 'can', 'could', 'do', 'does', 'did',
  'for', 'get', 'has', 'have', 'he', 'her', 'him', 'his', 'how', 'i', 'in',
  'is', 'it', 'its', 'johnny', 'johnnys', 'know', 'like', 'me', 'more', 'my',
  'of', 'on', 'or', 'please', 'she', 'show', 'so', 'some', 'tell', 'that',
  'the', 'their', 'them', 'then', 'there', 'they', 'this', 'to', 'us', 'was',
  'we', 'what', 'whats', 'when', 'where', 'which', 'who', 'whos', 'why',
  'will', 'with', 'would', 'you', 'your',
]);

export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUESTION_CHARS);
}

/** The question's content words — what scored matching runs on. */
export function deriveKeywords(question: string): string[] {
  return normalizeQuestion(question)
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/**
 * Exact phrasing first; else keyword scoring. The thresholds are the safety
 * property: a hit needs at least two matched content words AND a majority of
 * the question's content words matched, so conversational follow-ups ("tell
 * me more", "why") — which have zero or one content word — can never match.
 */
export function matchCache(entries: CacheEntry[], question: string): CacheEntry | null {
  const normalized = normalizeQuestion(question);
  if (!normalized) return null;

  for (const entry of entries) {
    if (entry.phrasings.includes(normalized)) return entry;
  }

  const tokens = deriveKeywords(question);
  if (tokens.length < 2) return null;

  let best: CacheEntry | null = null;
  let bestMatched = 0;
  for (const entry of entries) {
    const keywords = new Set(entry.keywords);
    const matched = tokens.filter((token) => keywords.has(token)).length;
    if (matched >= 2 && matched / tokens.length >= 0.6 && matched > bestMatched) {
      best = entry;
      bestMatched = matched;
    }
  }
  return best;
}

/**
 * The shared-cache safety gate: only a conversation's FIRST answer, clean and
 * action-free, may be served to other visitors. Questions carrying emails or
 * links are someone's contact attempt, not a lookup.
 */
export function canWriteBack(args: {
  question: string;
  priorFireflyTurns: number;
  answer: string;
  action: unknown;
}): boolean {
  const normalized = normalizeQuestion(args.question);
  return (
    args.priorFireflyTurns === 0 &&
    args.action === null &&
    normalized.length >= MIN_QUESTION_CHARS &&
    !/[@]|https?:|www\./i.test(args.question) &&
    args.answer.trim().length > 0 &&
    args.answer.length <= MAX_ANSWER_CHARS
  );
}

export function entryFromAnswer(
  question: string,
  format: SlideFormat,
  answer: string,
  recap: string | null,
  now: number = Date.now(),
): CacheEntry {
  const normalized = normalizeQuestion(question);
  return {
    id: `wb-${now}-${normalized.slice(0, 24).replace(/\s/g, '-')}`,
    phrasings: [normalized],
    keywords: deriveKeywords(question),
    format,
    answer,
    action: null,
    recap: recap ?? answer.split('\n')[0].slice(0, 150),
    seeded: false,
    hits: 0,
    updatedAt: now,
  };
}

/** Phrasing collisions are no-ops; growth beyond the cap evicts oldest unseeded. */
export function addEntry(entries: CacheEntry[], entry: CacheEntry): CacheEntry[] {
  const taken = new Set(entries.flatMap((e) => e.phrasings));
  if (entry.phrasings.some((p) => taken.has(p))) return entries;

  const next = [...entries, entry];
  if (next.length <= MAX_CACHE_ENTRIES) return next;

  const unseeded = next
    .filter((e) => !e.seeded)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const evict = new Set(unseeded.slice(0, next.length - MAX_CACHE_ENTRIES).map((e) => e.id));
  return next.filter((e) => !evict.has(e.id));
}

const FORMATS: SlideFormat[] = ['editorial', 'list', 'rail', 'experience', 'projects'];

/** Blob JSON is visitor-adjacent input: validate every entry before trusting it. */
export function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    Array.isArray(v.phrasings) && v.phrasings.every((p) => typeof p === 'string') &&
    Array.isArray(v.keywords) && v.keywords.every((k) => typeof k === 'string') &&
    FORMATS.includes(v.format as SlideFormat) &&
    typeof v.answer === 'string' &&
    (v.action === null || v.action === 'resume' || v.action === 'contact-form') &&
    typeof v.recap === 'string' &&
    typeof v.seeded === 'boolean' &&
    typeof v.hits === 'number' &&
    typeof v.updatedAt === 'number'
  );
}
