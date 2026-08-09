'use client';

import { FormEvent, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ASK, CHAT, PORTFOLIO } from '@/app/PORTFOLIO';
import {
  MAX_CONTACT_MESSAGE_CHARS,
  MAX_CONTACT_NAME_CHARS,
  validateDraft,
} from '@/app/_contact/draft';

type FormState = 'editing' | 'confirming' | 'sending' | 'sent' | 'failed';

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-teal-300/50';

/**
 * The /ask contact flow: the form owns collecting name and email — the model
 * only ever drafts the message. Sending takes an explicit confirm, and every
 * failure degrades to the mailto the site already offers.
 */
export default function ContactFormCard({ draft }: { draft: string }) {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<FormState>('editing');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(draft);

  const valid = validateDraft({ name, email, message });

  const toConfirm = (event: FormEvent) => {
    event.preventDefault();
    if (valid) setState('confirming');
  };

  const send = async () => {
    setState('sending');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      const body = (await response.json()) as { ok?: boolean };
      setState(body.ok ? 'sent' : 'failed');
    } catch (err) {
      console.error('ContactFormCard: send failed', err);
      setState('failed');
    }
  };

  if (state === 'sent') {
    return <p className="mt-3 text-sm text-teal-300">{CHAT.sentLabel}</p>;
  }

  if (state === 'failed') {
    return (
      <a href={`mailto:${PORTFOLIO.email}`} className="mt-3 inline-block text-sm text-teal-300 hover:underline">
        {CHAT.sendFailedLabel} →
      </a>
    );
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 w-full max-w-md rounded-xl bg-slate-800/80 p-4"
    >
      <p className="text-sm font-bold text-white">{ASK.formTitle}</p>
      <AnimatePresence mode="wait" initial={false}>
        {state === 'editing' ? (
          <motion.form
            key="editing"
            exit={reduceMotion ? undefined : { opacity: 0 }}
            onSubmit={toConfirm}
            className="mt-3 flex flex-col gap-2.5"
          >
            <input
              value={name}
              maxLength={MAX_CONTACT_NAME_CHARS}
              onChange={(e) => setName(e.target.value)}
              placeholder={ASK.nameLabel}
              aria-label={ASK.nameLabel}
              className={inputClass}
            />
            <input
              value={email}
              type="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder={ASK.emailLabel}
              aria-label={ASK.emailLabel}
              className={inputClass}
            />
            <textarea
              value={message}
              maxLength={MAX_CONTACT_MESSAGE_CHARS}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={ASK.messagePrompt}
              aria-label={ASK.messageLabel}
              rows={3}
              className={`${inputClass} resize-none`}
            />
            <button
              type="submit"
              disabled={!valid}
              className="self-end rounded-full bg-teal-400/10 px-5 py-1.5 text-sm text-teal-300 transition-opacity disabled:opacity-30"
            >
              {CHAT.sendLabel}
            </button>
          </motion.form>
        ) : (
          <motion.div
            key="confirming"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 flex flex-col gap-3"
          >
            <p className="text-sm text-gray-300">{ASK.confirmTitle}</p>
            <p className="rounded-lg bg-slate-900/60 p-3 text-sm leading-relaxed text-gray-300">{message}</p>
            <p className="text-xs text-gray-500">
              {name} · {email}
            </p>
            <div className="flex gap-3 self-end">
              <button
                type="button"
                onClick={() => setState('editing')}
                disabled={state === 'sending'}
                className="text-sm text-gray-400 transition-colors hover:text-teal-300 disabled:opacity-50"
              >
                {ASK.editLabel}
              </button>
              <button
                type="button"
                onClick={send}
                disabled={state === 'sending'}
                className="rounded-full bg-teal-400/10 px-5 py-1.5 text-sm text-teal-300 disabled:opacity-50"
              >
                {state === 'sending' ? CHAT.sendingLabel : ASK.confirmLabel}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
