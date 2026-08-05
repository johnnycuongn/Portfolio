import assert from 'node:assert/strict';
import { CHAT } from '../src/app/PORTFOLIO';

assert.equal(typeof CHAT.name, 'string');
assert.ok(CHAT.name.length > 0, 'firefly needs a name');
assert.ok(CHAT.greeting.length > 0, 'greeting must not be empty');
assert.equal(CHAT.chips.length, 3, 'exactly three opening chips');
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

console.log('check-content: ok');
