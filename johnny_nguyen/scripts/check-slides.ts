import assert from 'node:assert/strict';
import { parseSlideBody, scanLeadingTag, parseRailCards } from '../src/app/_ai/slides';

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
// A model that dashes its headline still gets a clean one.
assert.deepEqual(parseSlideBody('- Software Engineer at iMSX\n- ships end to end'), {
  headline: 'Software Engineer at iMSX',
  items: ['ships end to end'],
});

// --- scanLeadingTag: leading whitespace must not defeat the tag --------------

// Leading whitespace must not defeat the tag — models sometimes lead with it.
assert.deepEqual(scanLeadingTag(' [[SLIDE LIST]]\nHis toolbox.', false), {
  format: 'list',
  rest: 'His toolbox.',
});
assert.equal(scanLeadingTag('\n[[SLIDE EXPERIENCE]]\nFive years.', false).format, 'experience');
// Whitespace-only buffer mid-stream: still viable, keep waiting.
assert.equal(scanLeadingTag('\n', false).format, null);
assert.equal(scanLeadingTag(' [[SLI', false).format, null);
// But at stream end it settles editorial with the original text intact.
assert.deepEqual(scanLeadingTag(' [[SLI', true), { format: 'editorial', rest: ' [[SLI' });

// --- rail format -------------------------------------------------------------
assert.deepEqual(scanLeadingTag('[[SLIDE RAIL]]\nFour roles.\n- iMSX | Enterprise systems.', false).format, 'rail');
assert.equal(scanLeadingTag('[[SLIDE RA', false).format, null); // viable prefix waits

assert.deepEqual(parseRailCards('Four roles, five years.\n- iMSX | Enterprise systems end to end.\n- WebVine | Licence management from scratch.'), {
  headline: 'Four roles, five years.',
  cards: [
    { title: 'iMSX', body: 'Enterprise systems end to end.' },
    { title: 'WebVine', body: 'Licence management from scratch.' },
  ],
});
// A line without the separator is a body-only card.
assert.deepEqual(parseRailCards('H.\n- just a sentence with no title'), {
  headline: 'H.',
  cards: [{ title: '', body: 'just a sentence with no title' }],
});
// Empty bodies are dropped; a headline-only reply has zero cards.
assert.deepEqual(parseRailCards('H.\n- Title |'), { headline: 'H.', cards: [] });
assert.deepEqual(parseRailCards('Just a headline.'), { headline: 'Just a headline.', cards: [] });
// A pipe in the body is content, not a second separator.
assert.deepEqual(parseRailCards('H.\n- Ops | infra | both').cards, [{ title: 'Ops', body: 'infra | both' }]);

console.log('check-slides: ok');
