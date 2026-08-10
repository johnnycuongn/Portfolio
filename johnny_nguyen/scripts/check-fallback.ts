import assert from 'node:assert/strict';
import { matchFallback, FALLBACK_ANSWERS, CATCH_ALL } from '../src/app/_ai/fallback';

// Every entry is reachable by at least one of its own triggers.
for (const entry of FALLBACK_ANSWERS) {
  const hit = matchFallback(entry.triggers[0]);
  assert.equal(hit.id, entry.id, `entry "${entry.id}" not reachable via its first trigger`);
}

// Representative real questions land on the right entry.
const cases: [string, string][] = [
  ['Can I see his resume?', 'resume'],
  ['whats his cv look like', 'resume'],
  ['What is Johnny working on right now?', 'now'],
  ['Where does he work currently?', 'now'],
  ['What tech stack does he use?', 'stack'],
  ["What's Johnny's experience?", 'experience'],
  ['Tell me about his side projects', 'projects'],
  ['How do I contact him?', 'contact'],
  ['Is he open to new opportunities?', 'looking'],
  ['Who is Johnny?', 'who'],
  ['What is his education?', 'education'],
  ['Where did he go to university?', 'education'],
  ['Does he have a degree?', 'education'],
  ['What did he study?', 'education'],
  // "background" also triggers 'experience'; education wins the tie.
  ['His educational background?', 'education'],
  // ...but on its own, 'background' is still a question about his career.
  ['Tell me about his background', 'experience'],
];
for (const [question, expectedId] of cases) {
  assert.equal(matchFallback(question).id, expectedId, `"${question}" should match "${expectedId}"`);
}

// Off-topic questions fall through to the catch-all.
for (const q of ['What is the capital of France?', 'zxcvbnm', '']) {
  assert.equal(matchFallback(q).id, CATCH_ALL.id, `"${q}" should hit the catch-all`);
}

// Punctuation and casing do not matter.
assert.equal(matchFallback('RESUME!!!').id, 'resume');

// The resume entry opens the on-page viewer rather than navigating away.
assert.equal(matchFallback('resume').action?.opens, 'resume');
assert.equal(matchFallback('resume').action?.href, undefined, 'the resume answer must not carry a link');

// The two questions that have a rendered slide behind them must carry it, so
// /ask draws the timeline and the project rail even when the provider is down
// and the cache is empty — both slides read PORTFOLIO directly.
assert.equal(matchFallback("What's Johnny's experience?").slide?.format, 'experience');
assert.equal(matchFallback('Tell me about his side projects').slide?.format, 'projects');
for (const entry of FALLBACK_ANSWERS) {
  if (!entry.slide) continue;
  // The slide headline sits above the timeline/rail at slide scale — past
  // roughly a line it stops being a headline and starts wrapping over them.
  assert.ok(entry.slide.headline.length > 0, `"${entry.id}" slide needs a headline`);
  assert.ok(
    entry.slide.headline.length <= 60,
    `"${entry.id}" slide headline is ${entry.slide.headline.length} chars — too long to sit above a slide`,
  );
}

// The catch-all points at a real email.
assert.ok(CATCH_ALL.answer.includes('@'), 'catch-all should offer the email');

// Tone guard: no assistant-speak in any canned answer.
const banned = ['Certainly', 'Great question', "I'd be happy to", "It's important to note",
  'delve', 'leverage', 'robust', 'passionate about', 'Hope that helps'];
for (const entry of [...FALLBACK_ANSWERS, CATCH_ALL]) {
  for (const phrase of banned) {
    assert.ok(!entry.answer.toLowerCase().includes(phrase.toLowerCase()),
      `"${entry.id}" uses banned phrase "${phrase}"`);
  }
  // No emoji in answers.
  assert.ok(!/\p{Extended_Pictographic}/u.test(entry.answer),
    `"${entry.id}" contains an emoji`);
}

console.log('check-fallback: ok');
