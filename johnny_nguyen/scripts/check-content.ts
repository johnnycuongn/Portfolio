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

console.log('check-content: ok');
