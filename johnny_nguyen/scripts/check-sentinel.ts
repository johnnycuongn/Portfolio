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
// The whitespace framing the sentinel is held with it, never released ahead of
// it — once a token is streamed it cannot be taken back, so a confirmed
// sentinel must not leave a stray newline at the end of the visible reply.
assert.equal(heldPrefixLength('Done.\n[[CONTACT Sarah'), '\n[[CONTACT Sarah'.length);
assert.equal(heldPrefixLength('Done.\n\n[[RESUME]]'), '\n\n[[RESUME]]'.length);
assert.equal(heldPrefixLength('Done. [[RESUME]]'), ' [[RESUME]]'.length);

// A viable partial prefix at the very end: hold it.
// The space in front is held with the partial too, for the same reason: if the
// tail turns out not to be a sentinel it is all released together next chunk.
assert.equal(heldPrefixLength('Done. [[CON'), ' [[CON'.length);
assert.equal(heldPrefixLength('Done. [['), ' [['.length);
assert.equal(heldPrefixLength('Done. ['), ' ['.length);

// A '[[' that cannot become a known command is ordinary text: release it.
assert.equal(heldPrefixLength('See [[x'), 0);
assert.equal(heldPrefixLength('An array like [[1,2]] is fine'), 0);

// Trailing whitespace is held: a sentinel sits on its own line, so the newline
// before it must not be released before we know what follows it.
assert.equal(heldPrefixLength('Done.\n'), 1);
assert.equal(heldPrefixLength('Done.  '), 2);

// --- splitReply: sequences of trailing sentinels -----------------------------

import { splitReply } from '../src/app/_ai/sentinel';

const recapOnly = splitReply('He is at iMSX.\n[[RECAP Asked what he does; he builds enterprise systems at iMSX.]]');
assert.equal(recapOnly.visible, 'He is at iMSX.');
assert.deepEqual(recapOnly.commands, [
  { kind: 'recap', text: 'Asked what he does; he builds enterprise systems at iMSX.' },
]);

// Recap and an action on the same reply, either order.
const recapThenResume = splitReply('Here it is.\n[[RECAP Asked for the resume.]]\n[[RESUME]]');
assert.equal(recapThenResume.visible, 'Here it is.');
assert.deepEqual(recapThenResume.commands, [
  { kind: 'recap', text: 'Asked for the resume.' },
  { kind: 'resume' },
]);
const resumeThenRecap = splitReply('Here.\n[[RESUME]]\n[[RECAP Asked for the resume.]]');
assert.deepEqual(resumeThenRecap.commands, [{ kind: 'resume' }, { kind: 'recap', text: 'Asked for the resume.' }]);

// A malformed member is skipped; later members still parse.
// Note: one-pipe CONTACT bodies now parse as valid contact-form commands, not malformed.
const skipMalformed = splitReply('x\n[[CONTACT only-two | fields]]\n[[RECAP Still summarised.]]');
assert.deepEqual(skipMalformed.commands, [
  { kind: 'contact-form', draft: 'only-two | fields' },
  { kind: 'recap', text: 'Still summarised.' },
]);

// Empty or over-long recap bodies are malformed, not commands.
assert.deepEqual(splitReply('x\n[[RECAP   ]]').commands, []);
assert.deepEqual(splitReply(`x\n[[RECAP ${'a'.repeat(301)}]]`).commands, []);

// --- contact-form: the /ask form flow ----------------------------------------
// Bare CONTACT is intent with nothing drafted yet.
assert.deepEqual(splitReply('One line.\n[[CONTACT]]').commands, [{ kind: 'contact-form', draft: '' }]);
// A payload that is not a 3-field draft is the visitor's message, drafted.
assert.deepEqual(splitReply('Got it.\n[[CONTACT wants to talk about a role]]').commands, [
  { kind: 'contact-form', draft: 'wants to talk about a role' },
]);
// Recap + form on one reply still both parse.
assert.deepEqual(splitReply('Got it.\n[[RECAP Wants to reach him.]]\n[[CONTACT about a role]]').commands, [
  { kind: 'recap', text: 'Wants to reach him.' },
  { kind: 'contact-form', draft: 'about a role' },
]);
// An ATTEMPTED full draft (two-plus pipes) that fails validation stays
// suppressed — it must not leak emails into a form prefixed as a message.
assert.deepEqual(splitReply('x\n[[CONTACT  | s@acme.com | hello]]').commands, []);
// Legacy 3-field drafts still parse as the chat surface's contact command.
assert.deepEqual(
  splitReply('x\n[[CONTACT Sarah | sarah@acme.com | About work]]').commands[0],
  { kind: 'contact', draft: { name: 'Sarah', email: 'sarah@acme.com', message: 'About work' } },
);
// Over-long drafts are malformed.
assert.deepEqual(splitReply(`x\n[[CONTACT ${'a'.repeat(1001)}]]`).commands, []);
// The legacy single-command view never surfaces the form kind.
assert.equal(splitSentinel('x\n[[CONTACT wants to chat]]').command, null);

// An unterminated trailing sentinel is still invisible and still yields nothing.
const unterminatedRecap = splitReply('Sure.\n[[RECAP half a summar');
assert.equal(unterminatedRecap.visible, 'Sure.');
assert.deepEqual(unterminatedRecap.commands, []);

// splitSentinel still returns the first actionable command and hides recaps
// from its single-command view of the world.
assert.deepEqual(
  splitSentinel('Here.\n[[RECAP Asked for the resume.]]\n[[RESUME]]').command,
  { kind: 'resume' },
);

// heldPrefixLength holds a partial [[RECAP just like the other commands.
assert.equal(heldPrefixLength('answer text [[REC'), '[[REC'.length + 1);

console.log('check-sentinel: ok');
