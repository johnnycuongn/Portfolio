import { createLimiter } from '../../_ai/limits';
import { validateDraft, type ContactDraft } from '../../_contact/draft';
import { isMailerConfigured, sendContactEmail } from '../../_contact/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * Its own instance, far tighter than the chat's 10/120. Same caveat the module
 * documents: in-memory, resets on cold start, not shared between instances — a
 * quota guard rather than a gate. The real ceiling is Resend's 100/day.
 */
const limiter = createLimiter({ perIpPerHour: 3, sitePerDay: 20 });

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Every refusal looks identical to the visitor — the button falls back to a
 * mailto either way, and distinguishing "rate limited" from "bad key" would only
 * tell an abuser which wall they hit. The reason goes to the Vercel logs.
 */
function refuse(reason: string): Response {
  console.error('api/contact:', reason);
  return Response.json({ ok: false });
}

export async function POST(request: Request): Promise<Response> {
  let draft: ContactDraft;
  try {
    const body = (await request.json()) as Partial<ContactDraft>;
    draft = {
      name: String(body?.name ?? '').trim(),
      email: String(body?.email ?? '').trim(),
      message: String(body?.message ?? '').trim(),
    };
  } catch {
    return refuse('unparseable body');
  }

  // Re-validated here rather than trusted from the sentinel: this endpoint is
  // reachable without going near the chat.
  if (!validateDraft(draft)) return refuse('validation failed');

  const verdict = limiter.check(clientIp(request));
  if (!verdict.allowed) return refuse(`rate limited (${verdict.reason})`);

  if (!isMailerConfigured()) return refuse('RESEND_API_KEY is not set');

  return Response.json({ ok: await sendContactEmail(draft) });
}
