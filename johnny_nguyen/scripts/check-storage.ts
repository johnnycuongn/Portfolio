import assert from 'node:assert/strict';
import {
  loadChat, saveChat, clearChat, CHAT_STORAGE_KEY, MAX_STORED_MESSAGES, type StorageLike,
} from '../src/utils/chatStorage';
import type { ChatMessage } from '../src/app/_ai/types';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

const msg = (i: number): ChatMessage => ({ id: `m${i}`, role: 'user', text: `hello ${i}` });

// Round trip.
const s1 = memoryStorage();
saveChat(s1, [msg(1), msg(2)]);
assert.deepEqual(loadChat(s1).map((m) => m.id), ['m1', 'm2']);

// Trims to the most recent MAX_STORED_MESSAGES, oldest first.
const s2 = memoryStorage();
saveChat(s2, Array.from({ length: 30 }, (_, i) => msg(i)));
const trimmed = loadChat(s2);
assert.equal(trimmed.length, MAX_STORED_MESSAGES);
assert.equal(trimmed[0].id, 'm10');
assert.equal(trimmed[trimmed.length - 1].id, 'm29');

// Expires after 7 days.
const s3 = memoryStorage();
const eightDays = 8 * 24 * 60 * 60 * 1000;
saveChat(s3, [msg(1)], 0);
assert.deepEqual(loadChat(s3, eightDays), [], 'stale entry should be discarded');
assert.deepEqual(loadChat(s3, 0), [msg(1)], 'fresh entry should survive');

// Malformed JSON is discarded silently.
const s4 = memoryStorage();
s4.setItem(CHAT_STORAGE_KEY, '{not json');
assert.deepEqual(loadChat(s4), []);

// A future/unknown version is discarded.
const s5 = memoryStorage();
s5.setItem(CHAT_STORAGE_KEY, JSON.stringify({ version: 99, updatedAt: Date.now(), messages: [msg(1)] }));
assert.deepEqual(loadChat(s5), []);

// Non-array messages are discarded.
const s6 = memoryStorage();
s6.setItem(CHAT_STORAGE_KEY, JSON.stringify({ version: 1, updatedAt: Date.now(), messages: 'nope' }));
assert.deepEqual(loadChat(s6), []);

// A throwing setItem (Safari private mode) must not propagate.
const throwing: StorageLike = {
  getItem: () => null,
  setItem: () => { throw new Error('QuotaExceededError'); },
  removeItem: () => {},
};
assert.doesNotThrow(() => saveChat(throwing, [msg(1)]));

// A null storage is a no-op everywhere.
assert.deepEqual(loadChat(null), []);
assert.doesNotThrow(() => saveChat(null, [msg(1)]));
assert.doesNotThrow(() => clearChat(null));

// Clear wipes the entry.
const s7 = memoryStorage();
saveChat(s7, [msg(1)]);
clearChat(s7);
assert.deepEqual(loadChat(s7), []);

console.log('check-storage: ok');
