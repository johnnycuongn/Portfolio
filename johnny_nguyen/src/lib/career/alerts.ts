/**
 * Operator alerts for the career dashboard.
 *
 * One job: tell the owner when quick-add's Claude parser stops working, because
 * the credential it uses is an OAuth token and OAuth tokens expire. The failure
 * is otherwise silent by design — quick-add falls through to Gemini and keeps
 * working with a slightly worse parse — and a silent degradation that lasts
 * weeks is exactly what an alert is for.
 *
 * Three rules this module exists to enforce:
 *
 *   1. **It never breaks quick-add.** Every path returns, none throw. An alert
 *      that takes down the feature it is reporting on is worse than no alert.
 *   2. **It never storms.** An expired token fails on every single parse, so an
 *      un-throttled alert would send one email per attempt and be muted within a
 *      day. State lives in the `settings` table rather than in memory, because
 *      serverless instances do not share memory and each cold start would
 *      otherwise think it was the first failure.
 *   3. **It never repeats the secret.** Error objects from an HTTP client can
 *      carry request headers, and the header in question is the token. Only a
 *      scrubbed summary is sent.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { settings } from '@/lib/db/schema';

const STATE_KEY = 'career/claude-alert';
const ENDPOINT = 'https://api.resend.com/emails';

/** Resend's shared sender — no domain, no DNS. Mirrors `_contact/mailer.ts`. */
const FROM = 'Ledger <onboarding@resend.dev>';
const TIMEOUT_MS = 10_000;

/**
 * Long enough that a dead token produces one email a quarter-day rather than one
 * per keystroke, short enough that a real outage is not silent for a working week.
 */
const QUIET_HOURS = 6;

type AlertState = {
  lastNotifiedAt?: string;
  failuresSinceLastEmail?: number;
};

/**
 * Anything that looks like a credential is removed before the text leaves the
 * process. Deliberately broad: a long unbroken run of token-ish characters has no
 * business in an alert email, whatever produced it.
 */
function scrub(input: string): string {
  return input
    .replace(/\b(sk-ant-|sk_|Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1[redacted]')
    .replace(/\b[A-Za-z0-9._-]{40,}\b/g, '[redacted]')
    .slice(0, 400);
}

/** A one-line summary of what went wrong, with no credential in it. */
function describe(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { status?: number; name?: string; message?: string };
    const status = typeof e.status === 'number' ? `HTTP ${e.status}` : null;
    const name = e.name ?? 'Error';
    const message = e.message ? scrub(e.message) : '';
    // A 401 here means one thing in practice and it is worth saying outright.
    const hint =
      e.status === 401
        ? ' — this is what an expired OAuth token looks like.'
        : e.status === 429
          ? ' — rate limited rather than expired; it may clear on its own.'
          : '';
    return [status, name, message].filter(Boolean).join(' · ') + hint;
  }
  return scrub(String(error));
}

async function readState(): Promise<AlertState> {
  try {
    const rows = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, STATE_KEY))
      .limit(1);
    const value = rows[0]?.value;
    return value && typeof value === 'object' ? (value as AlertState) : {};
  } catch {
    // No state means "treat this as the first failure". Erring toward sending is
    // right: a duplicate email is a nuisance, a missed one defeats the feature.
    return {};
  }
}

async function writeState(state: AlertState): Promise<void> {
  const now = new Date();
  try {
    await db
      .insert(settings)
      .values({ key: STATE_KEY, value: state, updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: state, updatedAt: now },
      });
  } catch (error) {
    console.error('career/alerts: could not persist alert state', error);
  }
}

function recipient(): string | null {
  return process.env.CAREER_ALERT_EMAIL || process.env.CONTACT_TO_EMAIL || null;
}

/**
 * Report that the Claude parser failed. Safe to call on every failure — the
 * throttle is inside.
 *
 * Call it from `after()` so the visitor is not kept waiting on an email about a
 * fallback that already succeeded.
 */
export async function notifyClaudeParseFailure(error: unknown): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = recipient();
  if (!apiKey || !to) return;

  const state = await readState();
  const failures = (state.failuresSinceLastEmail ?? 0) + 1;

  const last = state.lastNotifiedAt ? Date.parse(state.lastNotifiedAt) : NaN;
  const quietUntil = Number.isNaN(last) ? 0 : last + QUIET_HOURS * 3600_000;
  if (Date.now() < quietUntil) {
    // Still inside the quiet window: count it, say nothing. The count rides along
    // to the next email so the owner can see how long it has really been broken.
    await writeState({ ...state, failuresSinceLastEmail: failures });
    return;
  }

  const summary = describe(error);
  const body = [
    "Quick-add's Claude parser failed, so it fell back to Gemini.",
    '',
    `What happened: ${summary}`,
    failures > 1 ? `Failed attempts since the last email: ${failures}` : '',
    '',
    'Quick-add still works — the fallback parses the same text slightly less well,',
    'and the form still opens either way. Nothing is broken for a visitor.',
    '',
    'If this is an expired token, replace it:',
    '  1. Mint a new one on your machine',
    '  2. python3 .../put_secret.py ANTHROPIC_AUTH_TOKEN',
    '  3. Push it to Vercel and redeploy',
    '',
    'A console API key (sk-ant-...) does not expire and would stop these emails',
    'for good — it goes in ANTHROPIC_API_KEY instead, with the beta header dropped.',
    '',
    `No further email about this for ${QUIET_HOURS} hours.`,
  ]
    .filter((line) => line !== '')
    .join('\n');

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: abort.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: 'Ledger: quick-add fell back to Gemini',
        text: body,
      }),
    });

    if (!response.ok) {
      console.error('career/alerts: Resend responded', response.status);
      // Not recorded as notified — an email Resend rejected was never sent, and
      // pretending otherwise would start the quiet window on nothing.
      await writeState({ ...state, failuresSinceLastEmail: failures });
      return;
    }

    await writeState({ lastNotifiedAt: new Date().toISOString(), failuresSinceLastEmail: 0 });
  } catch (error) {
    console.error('career/alerts: send failed', error);
    await writeState({ ...state, failuresSinceLastEmail: failures });
  } finally {
    clearTimeout(timeout);
  }
}
