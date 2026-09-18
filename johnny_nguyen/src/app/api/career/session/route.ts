import { and, asc, eq, gte } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

import { db } from '@/lib/db';
import { adminAttempts } from '@/lib/db/schema';
import {
  ADMIN_COOKIE,
  RATE_LIMIT,
  hashIp,
  newSessionToken,
  sessionCookieOptions,
  verifyCode,
} from '@/lib/career/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The code gate's only endpoint.
 *
 *   POST   { code }  -> sets the signed session cookie, or 401 / 429
 *   DELETE           -> clears it (sign out)
 *
 * Order matters here: the rate limit is applied BEFORE the code is compared, so
 * a locked-out caller never gets to run a comparison at all. The counter lives
 * in Postgres rather than in module state because every Vercel instance is its
 * own process — an in-memory limiter would reset on each cold start, and
 * hammering the endpoint spawns instances, so it would barely limit anything.
 */

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Identical for a wrong code and for a malformed body. It says nothing about
 * the real code — not its length, not how close the attempt was, nothing.
 */
function rejected(): Response {
  return Response.json({ ok: false, error: 'invalid_code' }, { status: 401 });
}

export async function POST(request: Request): Promise<Response> {
  let code: string;
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body?.code === 'string' ? body.code : '';
  } catch {
    code = '';
  }

  const ipHash = hashIp(clientIp(request));
  const windowStart = new Date(Date.now() - RATE_LIMIT.windowMs);

  // --- Rate limit, first and before any comparison ---------------------------
  let failures: { attemptedAt: Date }[];
  try {
    failures = await db
      .select({ attemptedAt: adminAttempts.attemptedAt })
      .from(adminAttempts)
      .where(
        and(
          eq(adminAttempts.ipHash, ipHash),
          eq(adminAttempts.succeeded, false),
          gte(adminAttempts.attemptedAt, windowStart),
        ),
      )
      .orderBy(asc(adminAttempts.attemptedAt));
  } catch (error) {
    // No limiter means no gate, so fail closed rather than waving everyone
    // through. The reason goes to the log; the caller learns nothing.
    console.error('api/career/session: attempt lookup failed', error);
    return Response.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }

  if (failures.length >= RATE_LIMIT.maxFailures) {
    // The lockout lifts when the OLDEST failure in the window ages out.
    const oldest = failures[0].attemptedAt.getTime();
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_LIMIT.windowMs - Date.now()) / 1000));
    return Response.json(
      { ok: false, error: 'rate_limited', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // --- Now, and only now, compare -------------------------------------------
  const ok = verifyCode(code);

  try {
    await db.insert(adminAttempts).values({
      id: uuid(),
      ipHash,
      attemptedAt: new Date(),
      succeeded: ok,
    });
  } catch (error) {
    // A lost row would let the limiter be bypassed, so a failed write is a
    // failed attempt — even when the code was right.
    console.error('api/career/session: attempt write failed', error);
    return Response.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }

  if (!ok) return rejected();

  const { cookies } = await import('next/headers');
  (await cookies()).set(ADMIN_COOKIE, newSessionToken(), sessionCookieOptions());

  return Response.json({ ok: true });
}

/** Sign out. Nothing to check — dropping your own cookie is always allowed. */
export async function DELETE(): Promise<Response> {
  const { cookies } = await import('next/headers');
  (await cookies()).set(ADMIN_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return Response.json({ ok: true });
}
