import assert from 'node:assert/strict';
import { CHAT } from '../src/app/PORTFOLIO';

assert.equal(typeof CHAT.name, 'string');
assert.ok(CHAT.name.length > 0, 'firefly needs a name');
assert.ok(CHAT.greeting.length > 0, 'greeting must not be empty');
// Bounded rather than exact: the count is a copy decision, but the chips sit on one
// or two rows of a 360px panel, and past five they crowd out the greeting they are
// meant to sit under. Raised from four when a projects chip was added — /ask leads
// with the project rail now, so it earns a shortcut.
assert.ok(
  CHAT.chips.length >= 2 && CHAT.chips.length <= 5,
  `expected 2-5 opening chips, got ${CHAT.chips.length}`,
);
for (const chip of CHAT.chips) {
  assert.ok(chip.label.length > 0, 'chip needs a label');
  assert.ok(chip.question.length > 0, 'chip needs a question to send');
}
assert.ok(CHAT.placeholder.length > 0);
assert.ok(CHAT.privacyNote.length > 0);
assert.ok(CHAT.clearLabel.length > 0);
assert.ok(CHAT.offlineMessage.length > 0, 'offline message must not be empty');
assert.ok(CHAT.offlineMessage.includes('@'), 'offline message should carry a real email, not a placeholder');
assert.ok(CHAT.openLabel.length > 0, 'beacon open aria-label must not be empty');
assert.ok(CHAT.closeLabel.length > 0, 'close aria-label must not be empty');
assert.ok(CHAT.dialogLabel.length > 0, 'panel dialog aria-label must not be empty');
assert.ok(CHAT.hintLabel.length > 0, 'beacon hint label must not be empty');
assert.ok(CHAT.hintLabel.length < 20, 'beacon hint sits beside the firefly — it has to stay short');
assert.ok(CHAT.sendLabel.length > 0, 'send action label must not be empty');
assert.ok(CHAT.sendingLabel.length > 0, 'sending label must not be empty');
assert.ok(CHAT.sentLabel.length > 0, 'sent label must not be empty');
assert.ok(CHAT.sendFailedLabel.length > 0, 'send-failed label must not be empty');
assert.ok(CHAT.resumeLabel.length > 0, 'resume action label must not be empty');

console.log('check-content: ok');
