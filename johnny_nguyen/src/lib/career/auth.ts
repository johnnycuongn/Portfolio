import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The whole security boundary for the career dashboard.
 *
 * There is no auth system here — one static code in CAREER_ADMIN_CODE is the
 * only gate, so this file has to be right. The rules it enforces:
 *
 *   1. The code is never compared with `===`. A plain compare short-circuits at
 *      the first differing byte, which leaks the code prefix-by-prefix to
 *      anyone willing to time a public endpoint.
 *   2. The cookie never carries the code, and is never a forgeable flag like
 *      `admin=true`. It is a signed, expiring token.
 *   3. The signing secret is SEPARATE from the code. Rotating
 *      CAREER_SESSION_SECRET signs every device out without changing the code
 *      Johnny has to remember; rotating the code does not strand live sessions.
 *   4. Hiding the admin UI is cosmetic. EVERY mutating route calls
 *      `adminOnly()` (or `requireAdmin()`), or the boundary does not exist.
 *
 * Neither secret is ever logged, returned, or put in an error message.
 */

/** The session cookie. Mutating routes read this and nothing else. */
export const ADMIN_COOKIE = 'career_admin';

/** 30 days, per the contract. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Rate-limit shape for the code gate, shared with the session route. */
export const RATE_LIMIT = {
  maxFailures: 5,
  windowMs: 15 * 60 * 1000,
} as const;

type SecretName = 'CAREER_ADMIN_CODE' | 'CAREER_SESSION_SECRET';

/**
 * Reads a required secret. Throws a clear error naming the variable — and only
 * the variable. The value never appears in the message, so a stack trace in the
 * Vercel log is safe to paste anywhere.
 */
function requireEnv(name: SecretName): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `${name} is not set. The career dashboard's admin gate cannot run without it. ` +
        `Set it in .env.local for local work and in the Vercel project settings for deploys.`,
    );
  }
  return value;
}

/**
 * A per-process key used only to make comparisons constant-length.
 *
 * `timingSafeEqual` throws outright when its two buffers differ in length, and
 * guarding that with an early `return false` would leak the code's length
 * through timing. HMAC-ing both sides first gives two 32-byte digests whatever
 * the inputs were, so one comparison covers every case and unequal lengths cost
 * exactly what equal ones do. The key is random per process and never leaves it,
 * so the digests are useless to an attacker.
 */
const COMPARE_KEY = randomBytes(32);

function fingerprint(value: string): Buffer {
  return createHmac('sha256', COMPARE_KEY).update(value, 'utf8').digest();
}

/**
 * True when `input` is exactly the configured admin code.
 *
 * Constant-time, and never throws on a length mismatch or a non-string — the
 * caller is an unauthenticated public endpoint, so every bad input has to land
 * on the same quiet `false`.
 */
export function verifyCode(input: string): boolean {
  if (typeof input !== 'string') return false;
  const expected = requireEnv('CAREER_ADMIN_CODE');
  return timingSafeEqual(fingerprint(input), fingerprint(expected));
}

/** `v1.<expiresAtMs>` — the signed half of the token. */
function payloadFor(expiresAt: number): string {
  return `v1.${Math.floor(expiresAt)}`;
}

function signPayload(payload: string): string {
  return createHmac('sha256', requireEnv('CAREER_SESSION_SECRET'))
    .update(payload, 'utf8')
    .digest('base64url');
}

/**
 * Mints a session token that expires at `expiresAt` (epoch milliseconds).
 *
 * The expiry is inside the signature, so a client cannot extend its own session
 * by editing the cookie — the cookie's own maxAge is only a browser-side
 * convenience and is not trusted.
 */
export function signSession(expiresAt: number | Date): string {
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : expiresAt;
  if (!Number.isFinite(ms)) throw new Error('signSession: expiresAt must be a finite timestamp');
  const payload = payloadFor(ms);
  return `${payload}.${signPayload(payload)}`;
}

/** Convenience: a token valid for the standard 30-day window. */
export function newSessionToken(now: number = Date.now()): string {
  return signSession(now + SESSION_MAX_AGE_SECONDS * 1000);
}

/**
 * True when `token` carries a valid signature from the current secret and has
 * not expired. Any malformation is a plain `false`, never a throw — this runs on
 * whatever bytes a visitor put in their cookie jar.
 */
export function verifySession(token: string, now: number = Date.now()): boolean {
  if (typeof token !== 'string' || token.length === 0 || token.length > 512) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [version, expiresRaw, signature] = parts;
  if (version !== 'v1') return false;

  if (!/^\d{1,15}$/.test(expiresRaw)) return false;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt)) return false;

  let expected: string;
  try {
    expected = signPayload(`${version}.${expiresRaw}`);
  } catch {
    // Missing secret: fail closed rather than letting anything through.
    return false;
  }

  // Both sides are base64url digests of the same fixed width, but the attacker
  // controls their half, so compare through the fingerprint again rather than
  // trusting the length.
  if (!timingSafeEqual(fingerprint(signature), fingerprint(expected))) return false;

  // Expiry is checked only once the signature holds, so an unsigned token learns
  // nothing about the window.
  return expiresAt > now;
}

/**
 * Reads the session cookie and says whether this request is the admin.
 *
 * `next/headers` is imported lazily so this module stays importable from a
 * plain tsx script (scripts/check-career-auth.ts) and from any non-request
 * context — the pure crypto above is the part worth asserting on.
 */
export async function requireAdmin(): Promise<boolean> {
  try {
    const { cookies } = await import('next/headers');
    const token = (await cookies()).get(ADMIN_COOKIE)?.value;
    if (!token) return false;
    return verifySession(token);
  } catch {
    // No request context, or a misconfigured secret. Fail closed.
    return false;
  }
}

/** The one 401 shape every mutating route returns. Says nothing useful. */
export function unauthorized(): Response {
  return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}

/**
 * The one-liner guard for route handlers:
 *
 *   const denied = await adminOnly();
 *   if (denied) return denied;
 *
 * Returns a ready-made 401 Response when the caller is not the admin, and
 * `null` when they are.
 */
export async function adminOnly(): Promise<Response | null> {
  return (await requireAdmin()) ? null : unauthorized();
}

/**
 * Keyed SHA-256 of an IP, for the rate-limit table. The raw address is never
 * stored: the table only ever needs to know "same caller as before", and a hash
 * answers that without keeping a log of who visited.
 *
 * Keyed rather than bare, because a bare SHA-256 of an IPv4 address is not
 * anonymous — the whole address space is four billion entries and rainbow-tables
 * in minutes. Keying it with the session secret makes the stored column useless
 * to anyone who ends up holding a copy of the database. Rotating the secret
 * resets the counters, which is harmless on a 15-minute window.
 */
export function hashIp(ip: string): string {
  return createHmac('sha256', requireEnv('CAREER_SESSION_SECRET'))
    .update(`ip:${ip}`, 'utf8')
    .digest('hex');
}

/** The cookie attributes used on sign-in, in one place so sign-out matches. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    // Off in local dev only — a `secure` cookie is silently dropped over
    // plain http://localhost, which would make the gate untestable.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
