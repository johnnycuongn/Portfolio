import assert from 'node:assert/strict';
import { clearAsk, loadAsk, newSessionId, saveAsk, type AskTurn } from '../src/utils/askStorage';
import type { StorageLike } from '../src/utils/chatStorage';

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A fresh store mints a session id and no turns.
const empty = loadAsk(memoryStorage());
assert.match(empty.sessionId, UUID_RE);
assert.deepEqual(empty.turns, []);

// Null storage (Safari private mode) still yields a usable session.
assert.match(loadAsk(null).sessionId, UUID_RE);

// Round trip.
const storage = memoryStorage();
const turn: AskTurn = {
  id: 't1',
  question: 'What does he do?',
  answer: 'He builds enterprise systems.\n- end to end',
  recap: 'Asked what he does; enterprise systems.',
  format: 'editorial',
};
saveAsk(storage, empty.sessionId, [turn]);
const restored = loadAsk(storage);
assert.equal(restored.sessionId, empty.sessionId);
assert.deepEqual(restored.turns, [turn]);

// Stale stores are discarded, id and all — a week-old session is over.
const stale = memoryStorage();
saveAsk(stale, empty.sessionId, [turn], Date.now() - 8 * 24 * 60 * 60 * 1000);
const revisited = loadAsk(stale);
assert.deepEqual(revisited.turns, []);
assert.notEqual(revisited.sessionId, empty.sessionId);

// Garbage never throws.
const corrupt = memoryStorage();
corrupt.setItem('ask-v1', '{not json');
assert.deepEqual(loadAsk(corrupt).turns, []);

// A tampered entry is dropped, not rendered into a crash.
const tampered = memoryStorage();
tampered.setItem('ask-v1', JSON.stringify({
  version: 1, updatedAt: Date.now(), sessionId: newSessionId(),
  turns: [
    { id: 'ok', question: 'q', answer: 'a', recap: null, format: 'editorial' },
    { id: 'bad', question: 'q', answer: 42, recap: null, format: 'editorial' },
    { id: 'worse', question: 'q', answer: 'a', recap: null, format: 'banana' },
  ],
}));
assert.deepEqual(loadAsk(tampered).turns.map((t) => t.id), ['ok']);

// Only the last 10 turns are kept.
const many = Array.from({ length: 14 }, (_, i) => ({ ...turn, id: `t${i}` }));
const overflowing = memoryStorage();
saveAsk(overflowing, empty.sessionId, many);
assert.equal(loadAsk(overflowing).turns.length, 10);
assert.equal(loadAsk(overflowing).turns[0].id, 't4');

// Clear removes everything.
clearAsk(storage);
assert.deepEqual(loadAsk(storage).turns, []);

// newSessionId is a well-formed uuid and unique per call.
assert.match(newSessionId(), UUID_RE);
assert.notEqual(newSessionId(), newSessionId());

console.log('check-ask-storage: ok');
