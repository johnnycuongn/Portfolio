import assert from 'node:assert/strict';
import { isCacheEntry } from '../src/app/_ai/cache';
import { normalizeQuestion } from '../src/app/_ai/cache';
import { SEED_ENTRIES } from '../src/app/_ai/seeds';

assert.ok(SEED_ENTRIES.length >= 18, `expected >= 18 seeds, got ${SEED_ENTRIES.length}`);

const ids = SEED_ENTRIES.map((e) => e.id);
assert.equal(new Set(ids).size, ids.length, 'seed ids must be unique');
for (const required of ['who-is-johnny', 'resume', 'experience', 'projects', 'skills', 'contact', 'salary', 'availability']) {
  assert.ok(ids.includes(required), `missing required seed: ${required}`);
}

const phrasings = SEED_ENTRIES.flatMap((e) => e.phrasings);
assert.equal(new Set(phrasings).size, phrasings.length, 'phrasings must not collide across seeds');

for (const entry of SEED_ENTRIES) {
  assert.ok(isCacheEntry(entry), `malformed seed: ${entry.id}`);
  assert.ok(entry.seeded, `${entry.id} must be seeded`);
  assert.ok(entry.phrasings.length >= 3, `${entry.id}: give visitors at least 3 phrasings`);
  for (const p of entry.phrasings) {
    assert.equal(p, normalizeQuestion(p), `${entry.id}: phrasing not normalized: "${p}"`);
  }
  assert.ok(entry.answer.length > 0 && entry.answer.length <= 600, `${entry.id}: answer length`);
  const headline = entry.answer.split('\n')[0];
  assert.ok(headline.trim().split(/\s+/).length <= 10, `${entry.id}: headline too long`);
  assert.ok(entry.recap.length > 0 && entry.recap.length <= 150, `${entry.id}: recap length`);
}

console.log('check-seeds: ok');
