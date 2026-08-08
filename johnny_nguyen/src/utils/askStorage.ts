import type { ChatAction } from '../app/_ai/types';
import type { SlideFormat } from '../app/_ai/slides';
import type { StorageLike } from './chatStorage';

export const ASK_STORAGE_KEY = 'ask-v1';
export const MAX_STORED_TURNS = 10;

const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** One settled exchange: the question and the slide it produced. */
export interface AskTurn {
  id: string;
  question: string;
  /** The full visible reply, headline and fragment lines included. */
  answer: string;
  /** The model's own 1–2 line summary; null when it forgot to leave one. */
  recap: string | null;
  format: SlideFormat;
  action?: ChatAction;
  fallback?: boolean;
}

interface StoredAsk {
  version: number;
  updatedAt: number;
  sessionId: string;
  turns: AskTurn[];
}

/** uuid v4 via the platform — no dependency, and Node 20 has it too (for checks). */
export function newSessionId(): string {
  return crypto.randomUUID();
}

export function loadAsk(
  storage: StorageLike | null,
  now: number = Date.now(),
): { sessionId: string; turns: AskTurn[] } {
  const fresh = () => ({ sessionId: newSessionId(), turns: [] as AskTurn[] });
  if (!storage) return fresh();
  try {
    const raw = storage.getItem(ASK_STORAGE_KEY);
    if (!raw) return fresh();

    const parsed = JSON.parse(raw) as StoredAsk;
    if (parsed?.version !== VERSION) return fresh();
    if (!Array.isArray(parsed.turns)) return fresh();
    if (typeof parsed.updatedAt !== 'number') return fresh();
    if (typeof parsed.sessionId !== 'string' || !parsed.sessionId) return fresh();
    // A stale conversation drops its session id too: the blob transcript for
    // that id is a closed book, and reusing it would stitch strangers together.
    if (now - parsed.updatedAt > MAX_AGE_MS) return fresh();

    return { sessionId: parsed.sessionId, turns: parsed.turns.slice(-MAX_STORED_TURNS) };
  } catch {
    return fresh();
  }
}

export function saveAsk(
  storage: StorageLike | null,
  sessionId: string,
  turns: AskTurn[],
  now: number = Date.now(),
): void {
  if (!storage) return;
  try {
    const payload: StoredAsk = {
      version: VERSION,
      updatedAt: now,
      sessionId,
      turns: turns.slice(-MAX_STORED_TURNS),
    };
    storage.setItem(ASK_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage disabled. Losing history must never break /ask.
  }
}

export function clearAsk(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(ASK_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
