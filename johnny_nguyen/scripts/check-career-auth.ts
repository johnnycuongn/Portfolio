import assert from 'node:assert/strict';

/**
 * Assertions over the pure half of the career dashboard's admin gate.
 *
 * Everything here runs against throwaway values set in this process. No real
 * secret is read, and none is ever printed — if this script ever needs the real
 * CAREER_ADMIN_CODE to pass, the design has gone wrong.
 *
 * The env vars are set BEFORE the module is imported, and the import is dynamic
 * so it happens after these lines rather than being hoisted above them.
 */
process.env.CAREER_ADMIN_CODE = 'check-code-not-a-real-one';
process.env.CAREER_SESSION_SECRET = 'check-secret-not-a-real-one';

async function main() {
  const auth = await import('../src/lib/career/auth');
  const { verifyCode, signSession, verifySession, hashIp, ADMIN_COOKIE, SESSION_MAX_AGE_SECONDS } = auth;

  // --- verifyCode ------------------------------------------------------------

  assert.equal(verifyCode('check-code-not-a-real-one'), true);
  assert.equal(verifyCode('check-code-not-a-real-onX'), false, 'a one-byte difference must fail');

  // timingSafeEqual throws outright on buffers of different lengths. The whole
  // point of hashing both sides first is that these are ordinary falses.
  assert.equal(verifyCode(''), false, 'empty input must not throw');
  assert.equal(verifyCode('short'), false, 'a shorter input must not throw');
  assert.equal(
    verifyCode('check-code-not-a-real-one-plus-a-great-deal-more-text'),
    false,
    'a longer input must not throw',
  );

  // The endpoint is public, so junk arrives. None of it may throw.
  assert.equal(verifyCode(undefined as unknown as string), false);
  assert.equal(verifyCode(null as unknown as string), false);
  assert.equal(verifyCode({} as unknown as string), false);

  // An unset code is a startup error, not a silently open door.
  delete process.env.CAREER_ADMIN_CODE;
  assert.throws(() => verifyCode('anything'), /CAREER_ADMIN_CODE is not set/);
  process.env.CAREER_ADMIN_CODE = 'check-code-not-a-real-one';

  // --- signSession / verifySession -------------------------------------------

  const now = Date.now();
  const token = signSession(now + 60_000);

  assert.equal(verifySession(token, now), true, 'a fresh token must verify');
  assert.equal(token.includes('check-code-not-a-real-one'), false, 'the cookie must not carry the code');
  assert.equal(token.includes('check-secret-not-a-real-one'), false, 'the cookie must not carry the secret');
  assert.equal(token.split('.').length, 3, 'token shape is v1.<expiry>.<signature>');

  // Tampering with the payload, which is the whole reason it is signed. Editing
  // the expiry is the interesting attack: extend your own session for free.
  const [version, expiry, signature] = token.split('.');
  assert.equal(
    verifySession(`${version}.${Number(expiry) + 60_000_000}.${signature}`, now),
    false,
    'an extended expiry must not verify against the old signature',
  );
  assert.equal(verifySession(`v2.${expiry}.${signature}`, now), false, 'a swapped version must not verify');
  assert.equal(
    verifySession(`${version}.${expiry}.${signature.slice(0, -1)}A`, now),
    false,
    'a flipped signature byte must not verify',
  );

  // Expiry.
  const expired = signSession(now - 1_000);
  assert.equal(verifySession(expired, now), false, 'an expired token must not verify');
  assert.equal(verifySession(expired, now - 2_000), true, 'the same token was valid before it expired');

  // A different secret. This is what makes secret rotation a global sign-out.
  process.env.CAREER_SESSION_SECRET = 'a-completely-different-check-secret';
  assert.equal(
    verifySession(token, now),
    false,
    'a token signed with the old secret must not verify under a new one',
  );
  const rotated = signSession(now + 60_000);
  assert.notEqual(rotated, token, 'the same payload under a different secret must sign differently');
  assert.equal(verifySession(rotated, now), true);
  process.env.CAREER_SESSION_SECRET = 'check-secret-not-a-real-one';

  // Garbage from a cookie jar is a false, never a throw.
  for (const junk of ['', 'admin=true', 'true', 'v1', 'v1.', '....', 'v1.abc.def', `v1.${expiry}`]) {
    assert.equal(verifySession(junk, now), false, `junk token ${JSON.stringify(junk)} must not verify`);
  }
  assert.equal(verifySession(undefined as unknown as string, now), false);
  assert.equal(verifySession('v1.1.' + 'A'.repeat(600), now), false, 'an oversized token must not verify');

  // The forgeable-flag failure mode this whole design exists to avoid.
  assert.equal(verifySession('admin', now), false);

  // Missing secret: fail closed rather than accepting anything.
  delete process.env.CAREER_SESSION_SECRET;
  assert.equal(verifySession(token, now), false, 'no secret means no valid session');
  assert.throws(() => signSession(now + 1000), /CAREER_SESSION_SECRET is not set/);
  process.env.CAREER_SESSION_SECRET = 'check-secret-not-a-real-one';

  // --- hashIp ----------------------------------------------------------------

  const hashed = hashIp('203.0.113.7');
  assert.equal(/^[0-9a-f]{64}$/.test(hashed), true, 'hashIp returns a hex sha256 digest');
  assert.equal(hashed.includes('203.0.113'), false, 'the raw address must not survive into the column');
  assert.equal(hashIp('203.0.113.7'), hashed, 'the same address must hash the same way within a window');
  assert.notEqual(hashIp('203.0.113.8'), hashed, 'different addresses must not collide');

  // --- constants the eight screen agents depend on ---------------------------

  assert.equal(ADMIN_COOKIE, 'career_admin');
  assert.equal(SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 30);

  console.log('check-career-auth: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
