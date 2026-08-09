import assert from 'node:assert/strict';
import {
  addEntry,
  canWriteBack,
  deriveKeywords,
  entryFromAnswer,
  isCacheEntry,
  matchCache,
  MAX_CACHE_ENTRIES,
  normalizeQuestion,
  type CacheEntry,
} from '../src/app/_ai/cache';

const entry = (over: Partial<CacheEntry>): CacheEntry => ({
  id: 'x',
  phrasings: [],
  keywords: [],
  format: 'editorial',
  answer: 'Headline.',
  action: null,
  recap: 'r',
  seeded: false,
  hits: 0,
  updatedAt: 1,
  ...over,
});

// --- normalizeQuestion ------------------------------------------------------
assert.equal(normalizeQuestion('  Who IS Johnny?!  '), 'who is johnny');
assert.equal(normalizeQuestion("What's his stack?"), 'whats his stack');
// Idempotent — normalizing a normalized string changes nothing.
assert.equal(normalizeQuestion(normalizeQuestion('Tell me about Johnny')), 'tell me about johnny');

// --- deriveKeywords: content words only -------------------------------------
assert.deepEqual(deriveKeywords('What technologies does he use?'), ['technologies', 'use']);
assert.deepEqual(deriveKeywords('Tell me more'), []);

// --- matchCache: exact phrasing wins ----------------------------------------
const who = entry({ id: 'who', phrasings: ['who is johnny', 'tell me about johnny'], keywords: ['who', 'about', 'introduce', 'background'] });
const skills = entry({ id: 'skills', phrasings: ['whats his stack'], keywords: ['tech', 'technologies', 'stack', 'skills', 'tools', 'languages', 'use'] });
const entries = [who, skills];

assert.equal(matchCache(entries, 'Who is Johnny?'), who);
assert.equal(matchCache(entries, 'TELL me about Johnny'), who);

// --- matchCache: keyword scoring over the threshold -------------------------
assert.equal(matchCache(entries, 'What technologies and tools does he use?'), skills);

// --- matchCache: follow-ups and vague questions can never match -------------
assert.equal(matchCache(entries, 'tell me more'), null);
assert.equal(matchCache(entries, 'why?'), null);
assert.equal(matchCache(entries, 'and then what happened'), null);
// One keyword alone is not confidence.
assert.equal(matchCache(entries, 'does he use vim'), null);
// Empty input, empty entries.
assert.equal(matchCache(entries, '   '), null);
assert.equal(matchCache([], 'who is johnny'), null);

// --- canWriteBack gates ------------------------------------------------------
const ok = { question: 'what does johnny think about testing', priorFireflyTurns: 0, answer: 'He tests what matters.\n- check scripts', action: null };
assert.equal(canWriteBack(ok), true);
assert.equal(canWriteBack({ ...ok, priorFireflyTurns: 1 }), false);            // not first turn
assert.equal(canWriteBack({ ...ok, action: { label: 'x' } }), false);          // carried an action
assert.equal(canWriteBack({ ...ok, question: 'hi' }), false);                  // too short
assert.equal(canWriteBack({ ...ok, question: 'email me at a@b.co about him' }), false); // email
assert.equal(canWriteBack({ ...ok, question: 'see http://x.co for context' }), false);  // url
assert.equal(canWriteBack({ ...ok, answer: 'x'.repeat(601) }), false);         // answer cap
assert.equal(canWriteBack({ ...ok, answer: '' }), false);                      // no headline

// --- entryFromAnswer + addEntry ---------------------------------------------
const fresh = entryFromAnswer('What does Johnny think about testing?', 'editorial', 'He tests what matters.', null, 42);
assert.equal(fresh.phrasings[0], 'what does johnny think about testing');
assert.ok(fresh.keywords.includes('testing'));
assert.equal(fresh.recap, 'He tests what matters.');
assert.equal(fresh.seeded, false);
assert.equal(fresh.updatedAt, 42);

// A phrasing collision is a no-op — never overwrite an existing answer.
assert.equal(addEntry([who], entry({ phrasings: ['who is johnny'] })).length, 1);

// Eviction: oldest unseeded goes first; seeded entries are never evicted.
const seeded = entry({ id: 'seed', seeded: true, updatedAt: 0, phrasings: ['seeded q'] });
const crowd = Array.from({ length: MAX_CACHE_ENTRIES - 1 }, (_, i) =>
  entry({ id: `e${i}`, updatedAt: i + 1, phrasings: [`crowd q ${i}`] }),
);
const grown = addEntry([seeded, ...crowd], entry({ id: 'new', updatedAt: 999, phrasings: ['brand new q'] }));
assert.equal(grown.length, MAX_CACHE_ENTRIES);
assert.ok(grown.some((e) => e.id === 'seed'));
assert.ok(!grown.some((e) => e.id === 'e0'));
assert.ok(grown.some((e) => e.id === 'new'));

// --- isCacheEntry ------------------------------------------------------------
assert.equal(isCacheEntry(who), true);
assert.equal(isCacheEntry({ ...who, answer: 42 }), false);
assert.equal(isCacheEntry({ ...who, format: 'banana' }), false);
assert.equal(isCacheEntry(null), false);

console.log('check-cache: ok');
