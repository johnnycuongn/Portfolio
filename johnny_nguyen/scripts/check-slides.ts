import assert from 'node:assert/strict';
import { parseSlideBody, scanLeadingTag } from '../src/app/_ai/slides';

// --- scanLeadingTag: tags settle as soon as they are complete ----------------

assert.deepEqual(scanLeadingTag('[[SLIDE LIST]]\nHis toolbox.\n- TypeScript', false), {
  format: 'list',
  rest: 'His toolbox.\n- TypeScript',
});
assert.deepEqual(scanLeadingTag('[[SLIDE EXPERIENCE]]\nFive years.', false), {
  format: 'experience',
  rest: 'Five years.',
});
assert.deepEqual(scanLeadingTag('[[SLIDE PROJECTS]]\nFour builds.', false), {
  format: 'projects',
  rest: 'Four builds.',
});
// The tag is complete even before its newline arrives.
assert.equal(scanLeadingTag('[[SLIDE LIST]]', false).format, 'list');
assert.equal(scanLeadingTag('[[SLIDE LIST]]', false).rest, '');

// --- scanLeadingTag: viable prefixes wait, everything else settles -----------

// A prefix of a tag: keep buffering.
assert.equal(scanLeadingTag('[[SLI', false).format, null);
assert.equal(scanLeadingTag('[[SLIDE EXPE', false).format, null);
// Ordinary prose settles immediately as editorial — no held-back first token.
assert.deepEqual(scanLeadingTag('He builds things.', false), {
  format: 'editorial',
  rest: 'He builds things.',
});
// A bracket that stops matching settles too.
assert.equal(scanLeadingTag('[[RESUME]]', false).format, 'editorial');
// Unknown tag name: editorial, tag text kept (visible text is never eaten).
assert.equal(scanLeadingTag('[[SLIDE BANANA]]\nhm', false).format, 'editorial');
assert.equal(scanLeadingTag('[[SLIDE BANANA]]\nhm', false).rest, '[[SLIDE BANANA]]\nhm');
// Stream ended while still a viable prefix: settle as editorial with the text.
assert.deepEqual(scanLeadingTag('[[SLI', true), { format: 'editorial', rest: '[[SLI' });
// Empty buffer at stream end.
assert.deepEqual(scanLeadingTag('', true), { format: 'editorial', rest: '' });

// --- parseSlideBody ----------------------------------------------------------

assert.deepEqual(parseSlideBody('He builds enterprise systems.\n- end to end\n- four sectors'), {
  headline: 'He builds enterprise systems.',
  items: ['end to end', 'four sectors'],
});
// Blank lines are skipped; non-dashed lines still count as items.
assert.deepEqual(parseSlideBody('\nHis toolbox.\n\nTypeScript\n- AWS\n'), {
  headline: 'His toolbox.',
  items: ['TypeScript', 'AWS'],
});
// Headline-only reply.
assert.deepEqual(parseSlideBody('Just this.'), { headline: 'Just this.', items: [] });
// Empty text degrades to empty strings, never throws.
assert.deepEqual(parseSlideBody(''), { headline: '', items: [] });

console.log('check-slides: ok');
