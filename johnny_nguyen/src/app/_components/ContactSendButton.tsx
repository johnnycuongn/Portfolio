'use client';

import { useCallback, useState } from 'react';
import { CHAT, PORTFOLIO } from '../PORTFOLIO';
import type { ContactDraft } from '../_contact/draft';

type SendState = 'idle' | 'sending' | 'sent' | 'failed';

/**
 * The send is a human click, never the model's decision. That is what stops a
 * visitor talking Firefly into mailing thirty times, and it gives a typo'd
 * address a chance to be caught before it is useless.
 *
 * State lives here rather than on the message, so clearing or reloading the
 * transcript starts a fresh draft and `chatStorage` stays untouched.
 */
export default function ContactSendButton({ draft }: { draft: ContactDraft }) {
  const [state, setState] = useState<SendState>('idle');

  const send = useCallback(async () => {
    setState('sending');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = (await response.json()) as { ok?: boolean };
      setState(body.ok ? 'sent' : 'failed');
    } catch (err) {
      // The route never errors by design, so this is a genuinely offline
      // client. Same visitor-facing outcome as a refusal either way.
      console.error('ContactSendButton: send failed', err);
      setState('failed');
    }
  }, [draft]);

  if (state === 'sent') {
    return <p className="mt-1 text-xs text-teal-300">{CHAT.sentLabel}</p>;
  }

  if (state === 'failed') {
    // Every failure degrades into the mailto the site already offered.
    return (
      <a
        href={`mailto:${PORTFOLIO.email}`}
        className="mt-1 inline-block text-xs text-teal-300 hover:underline"
      >
        {CHAT.sendFailedLabel} →
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={state === 'sending'}
      className="mt-1 inline-block text-xs text-teal-300 transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
    >
      {state === 'sending' ? CHAT.sendingLabel : `${CHAT.sendLabel} →`}
    </button>
  );
}
