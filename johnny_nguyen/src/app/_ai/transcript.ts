import { put } from '@vercel/blob';
import { blobToken } from './blobToken';

/**
 * /ask transcript logging. One private blob per turn under the visitor's
 * anonymous session id — append-only by construction, so there is no
 * read-modify-write and nothing to race. Absent token (local dev) or any
 * failure: silently do nothing. Logging is a bonus, never a dependency.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The session id becomes a blob pathname, so only exact uuids qualify. */
export function isLoggableSessionId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function formatTurn(question: string, answer: string, now: Date = new Date()): string {
  return `[${now.toISOString()}]\nQ: ${question}\nA: ${answer}\n`;
}

/** Fire-and-forget: never awaited by the caller, never throws into the stream. */
export function logAskTurn(sessionId: string, question: string, answer: string): void {
  const token = blobToken();
  if (!token) return;
  if (!isLoggableSessionId(sessionId)) return;

  put(`asks/${sessionId}/${Date.now()}.txt`, formatTurn(question, answer), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'text/plain; charset=utf-8',
    token,
  }).catch((err) => {
    // Operator-facing only; the visitor's reply has already streamed.
    console.error('transcript: blob write failed', err);
  });
}
