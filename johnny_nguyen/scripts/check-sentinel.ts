import assert from 'node:assert/strict';
import { heldPrefixLength, splitSentinel } from '../src/app/_ai/sentinel';

// --- splitSentinel: the happy paths -----------------------------------------

const contact = splitSentinel(
  "Got it — I'll pass that on.\n[[CONTACT Sarah Chen | sarah@acme.com | Wants to talk about contract work]]",
);
assert.equal(contact.visible, "Got it — I'll pass that on.");
assert.deepEqual(contact.command, {
  kind: 'contact',
  draft: {
    name: 'Sarah Chen',
    email: 'sarah@acme.com',
    message: 'Wants to talk about contract work',
  },
});

const resume = splitSentinel('Here it is.\n[[RESUME]]');
assert.equal(resume.visible, 'Here it is.');
assert.deepEqual(resume.command, { kind: 'resume' });

// A reply with no sentinel is returned untouched.
const plain = splitSentinel("He's at iMSX right now, mostly enterprise systems.");
assert.equal(plain.visible, "He's at iMSX right now, mostly enterprise systems.");
assert.equal(plain.command, null);

// --- splitSentinel: everything malformed fails to "no action" ---------------

// Unterminated: the visible text still stops before the sentinel, so a
// half-written sentinel is never shown to the visitor.
const unterminated = splitSentinel('Sure thing.\n[[CONTACT Sarah | sarah@acme.com');
assert.equal(unterminated.visible, 'Sure thing.');
assert.equal(unterminated.command, null);

// Fewer than three fields.
assert.equal(splitSentinel('x\n[[CONTACT Sarah | sarah@acme.com]]').command, null);
// Empty name.
assert.equal(splitSentinel('x\n[[CONTACT  | s@acme.com | hello]]').command, null);
// Malformed email.
assert.equal(splitSentinel('x\n[[CONTACT Sarah | not-an-email | hello]]').command, null);
// Empty message.
assert.equal(splitSentinel('x\n[[CONTACT Sarah | s@acme.com |   ]]').command, null);
// Over-length message.
assert.equal(
  splitSentinel(`x\n[[CONTACT Sarah | s@acme.com | ${'a'.repeat(1001)}]]`).command,
  null,
);
// An unknown command is not an action.
assert.equal(splitSentinel('x\n[[DELETE everything]]').command, null);

// A '|' inside the message must not truncate it — the message is everything
// after the second separator, joined back up.
const piped = splitSentinel('x\n[[CONTACT Sarah | s@acme.com | Ops | infra | both]]');
assert.deepEqual(piped.command, {
  kind: 'contact',
  draft: { name: 'Sarah', email: 's@acme.com', message: 'Ops | infra | both' },
});

// The first sentinel wins; a second is left inside the first's payload or
// ignored entirely. Either way exactly one action comes out.
const twice = splitSentinel('x\n[[RESUME]]\n[[CONTACT Sarah | s@acme.com | hi]]');
assert.deepEqual(twice.command, { kind: 'resume' });
assert.equal(twice.visible, 'x');

// A malformed FIRST sentinel suppresses the action entirely rather than
// letting a later one through — safest reading of "the first wins".
assert.equal(splitSentinel('x\n[[CONTACT bad]]\n[[RESUME]]').command, null);

// --- heldPrefixLength: what must not be streamed yet ------------------------

// Nothing suspicious: release everything.
assert.equal(heldPrefixLength('He works at iMSX.'), 0);

// A complete sentinel has begun: hold from '[[' to the end.
assert.equal(heldPrefixLength('Done.\n[[CONTACT Sarah'), '[[CONTACT Sarah'.length);

// A viable partial prefix at the very end: hold it.
assert.equal(heldPrefixLength('Done. [[CON'), '[[CON'.length);
assert.equal(heldPrefixLength('Done. [['), 2);
assert.equal(heldPrefixLength('Done. ['), 1);

// A '[[' that cannot become a known command is ordinary text: release it.
assert.equal(heldPrefixLength('See [[x'), 0);
assert.equal(heldPrefixLength('An array like [[1,2]] is fine'), 0);

// Trailing whitespace is held: a sentinel sits on its own line, so the newline
// before it must not be released before we know what follows it.
assert.equal(heldPrefixLength('Done.\n'), 1);
assert.equal(heldPrefixLength('Done.  '), 2);

console.log('check-sentinel: ok');
