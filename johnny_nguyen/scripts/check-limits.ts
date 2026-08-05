import assert from 'node:assert/strict';
import { createLimiter } from '../src/app/_ai/limits';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Per-IP hourly cap.
const a = createLimiter({ perIpPerHour: 3, sitePerDay: 100 });
for (let i = 0; i < 3; i++) {
  assert.equal(a.check('1.1.1.1', 0).allowed, true, `request ${i} should be allowed`);
}
assert.deepEqual(a.check('1.1.1.1', 0), { allowed: false, reason: 'ip' });

// A different IP is unaffected.
assert.equal(a.check('2.2.2.2', 0).allowed, true);

// The hourly window slides.
assert.equal(a.check('1.1.1.1', HOUR + 1).allowed, true, 'window should have expired');

// Site-wide daily cap wins over an otherwise-fine IP.
const b = createLimiter({ perIpPerHour: 100, sitePerDay: 2 });
assert.equal(b.check('1.1.1.1', 0).allowed, true);
assert.equal(b.check('2.2.2.2', 0).allowed, true);
assert.deepEqual(b.check('3.3.3.3', 0), { allowed: false, reason: 'day' });

// The daily counter resets.
assert.equal(b.check('3.3.3.3', DAY + 1).allowed, true);

// A blocked request does not consume quota.
const c = createLimiter({ perIpPerHour: 1, sitePerDay: 100 });
assert.equal(c.check('1.1.1.1', 0).allowed, true);
assert.equal(c.check('1.1.1.1', 0).allowed, false);
assert.equal(c.check('9.9.9.9', 0).allowed, true, 'blocked IP should not have burned site quota');

console.log('check-limits: ok');
