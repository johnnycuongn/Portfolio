import assert from 'node:assert/strict';
import { formatTurn, isLoggableSessionId } from '../src/app/_ai/transcript';

// Only well-formed uuids are loggable — the client mints them, so anything
// else is a caller playing games with blob pathnames.
assert.equal(isLoggableSessionId('a3bb189e-8bf9-3888-9912-ace4e6543002'), true);
assert.equal(isLoggableSessionId('../../etc/passwd'), false);
assert.equal(isLoggableSessionId('a3bb189e-8bf9-3888-9912-ace4e654300Z'), false);
assert.equal(isLoggableSessionId(''), false);
assert.equal(isLoggableSessionId(undefined), false);
assert.equal(isLoggableSessionId(42), false);

// The stored text carries both sides and a timestamp.
const turn = formatTurn('What does he do?', 'He builds systems.', new Date('2026-08-08T09:30:00Z'));
assert.match(turn, /2026-08-08T09:30:00/);
assert.match(turn, /Q: What does he do\?/);
assert.match(turn, /A: He builds systems\./);

console.log('check-transcript: ok');
