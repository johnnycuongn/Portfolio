import { PORTFOLIO } from '../PORTFOLIO';
import type { ContactDraft } from './draft';

const ENDPOINT = 'https://api.resend.com/emails';
/** Resend's shared sender. Works with no domain and no DNS, and on the free
 *  tier can only deliver to the account's own address — which is the only
 *  recipient this feature has. */
const FROM = 'Portfolio Firefly <onboarding@resend.dev>';
const TIMEOUT_MS = 10_000;

export function isMailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Returns whether the mail was accepted. Never throws: the caller's only branch
 * is sent-or-not, and every failure here has the same visitor-facing outcome.
 * Mirrors `_ai/provider.ts` — a plain fetch, no SDK, so swapping email provider
 * means rewriting this file and nothing else.
 */
export async function sendContactEmail(draft: ContactDraft): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

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
        to: [process.env.CONTACT_TO_EMAIL || PORTFOLIO.email],
        // The point of the whole feature: hitting reply goes to the visitor,
        // not to Resend.
        reply_to: draft.email,
        subject: `Portfolio message from ${draft.name}`,
        text: [
          draft.message,
          '',
          '—',
          `${draft.name} <${draft.email}>`,
          'Sent from the firefly chat on your portfolio.',
        ].join('\n'),
      }),
    });

    if (!response.ok) {
      // Operator-facing only. The body carries Resend's reason (bad key,
      // unverified recipient, quota), which is otherwise invisible in the logs.
      console.error('_contact/mailer: Resend responded', response.status, await response.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('_contact/mailer: send failed', err);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
