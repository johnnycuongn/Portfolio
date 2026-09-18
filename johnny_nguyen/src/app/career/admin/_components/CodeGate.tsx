'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { useRouter } from 'next/navigation';

/**
 * The admin code gate.
 *
 * This screen is a courtesy, not the security boundary — every mutating route
 * calls `adminOnly()` on the server regardless of what is rendered here. So it
 * stays calm and small: one field, one button, no lock icons, no warnings.
 *
 * It is the first thing anyone sees at `/career/admin`, which makes it the app's
 * first impression, so it is built from the same tokens as everything behind it:
 * one small panel on the ground, a ruled field, a neutral button. Nothing here
 * wears the signal colour — the accent marks work you have finished, and typing a
 * password is not an achievement.
 *
 * Three presentation decisions worth keeping:
 *
 *   - **A `<section>`, not a `<main>`.** Two of the four admin pages render this
 *     inside their own `<main>`, and a nested main is invalid.
 *   - **The error is a rule, not red text.** `overdue` is a 3:1-ish colour on riso
 *     paper, which is fine for a 2px mark beside ink text and not fine for 13px
 *     type. The same pattern is used for a wrong code, a lockout and an outage.
 *   - **The only motion is the shake**, which answers something you did. There is
 *     no entrance fade: a gate that animates itself in on every load is the
 *     generated-page default.
 */

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'wrong' }
  | { kind: 'locked'; until: number }
  | { kind: 'unavailable' };

function formatWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export default function CodeGate({ onUnlocked }: { onUnlocked?: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const shake = useAnimationControls();

  const locked = phase.kind === 'locked' && phase.until > now;
  const busy = phase.kind === 'checking';

  // Only ticks while locked, so the idle screen is not re-rendering once a
  // second for no reason.
  useEffect(() => {
    if (phase.kind !== 'locked') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase.kind]);

  useEffect(() => {
    if (phase.kind === 'locked' && phase.until <= now) setPhase({ kind: 'idle' });
  }, [phase, now]);

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy || locked || code.length === 0) return;
      setPhase({ kind: 'checking' });

      let response: Response;
      try {
        response = await fetch('/api/career/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
        });
      } catch {
        setPhase({ kind: 'unavailable' });
        return;
      }

      if (response.ok) {
        setCode('');
        setPhase({ kind: 'idle' });
        // The cookie is set; re-running the server render is what reveals the
        // editable screens.
        onUnlocked?.();
        router.refresh();
        return;
      }

      if (response.status === 429) {
        let seconds = 15 * 60;
        try {
          const body = (await response.json()) as { retryAfter?: unknown };
          if (typeof body?.retryAfter === 'number' && body.retryAfter > 0) seconds = body.retryAfter;
        } catch {
          /* keep the default */
        }
        setNow(Date.now());
        setPhase({ kind: 'locked', until: Date.now() + seconds * 1000 });
        return;
      }

      if (response.status === 401) {
        setCode('');
        setPhase({ kind: 'wrong' });
        void shake.start({ x: [0, -5, 5, -3, 0], transition: { duration: 0.28 } });
        inputRef.current?.focus();
        return;
      }

      setPhase({ kind: 'unavailable' });
    },
    [busy, code, locked, onUnlocked, router, shake],
  );

  const message =
    phase.kind === 'wrong'
      ? 'That is not the code.'
      : phase.kind === 'unavailable'
        ? 'The gate is unreachable right now. Try again in a moment.'
        : locked && phase.kind === 'locked'
          ? `Too many attempts. Try again in ${formatWait(phase.until - now)}.`
          : null;

  return (
    <section
      aria-label="Unlock editing"
      className="grid min-h-[68vh] w-full place-items-center px-1 py-8 sm:px-4 sm:py-12"
    >
      <motion.div animate={shake} className="w-full max-w-[360px]">
        <div className="rounded-xl border border-rule bg-surface p-5 shadow-panel sm:p-6">
          <h1 className="type-display m-0 text-[22px] text-ink">Ledger</h1>
          <p className="m-0 mt-2 text-[13px] leading-[1.5] text-ink-muted">
            The dashboard is readable by anyone with the link. Editing needs the code.
          </p>

          <form onSubmit={submit} className="mt-6">
            <label htmlFor="career-admin-code" className="block text-[12.5px] text-ink-muted">
              Access code
            </label>
            <input
              id="career-admin-code"
              ref={inputRef}
              type="password"
              name="career-admin-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={busy || locked}
              aria-invalid={phase.kind === 'wrong'}
              aria-describedby={message ? 'career-admin-code-message' : undefined}
              className="mt-2 h-11 w-full box-border rounded-md border border-rule bg-ground px-3 text-[15px] tracking-[0.14em] text-ink outline-none transition-colors focus:border-signal disabled:bg-surface-2 disabled:text-ink-faint"
            />

            <button
              type="submit"
              disabled={busy || locked || code.length === 0}
              // Disabled is an inert, ruled slot rather than a dimmed black slab:
              // an empty field should not be looking at a heavy grey button.
              className="mt-3 h-11 w-full rounded-md border border-transparent bg-ink text-[13.5px] font-medium text-ground transition-colors hover:bg-ink-muted disabled:cursor-not-allowed disabled:border-rule disabled:bg-surface-2 disabled:text-ink-faint"
            >
              {busy ? 'Checking' : 'Unlock editing'}
            </button>
          </form>

          <div className="mt-3 min-h-[20px]" aria-live="polite" id="career-admin-code-message">
            {message ? (
              <p className="m-0 flex items-stretch gap-2 text-[12.5px] leading-[1.45] text-ink">
                <span className="w-[2px] shrink-0 rounded-[1px] bg-overdue" aria-hidden />
                {message}
              </p>
            ) : null}
          </div>
        </div>

        <a
          href="/career"
          className="mt-3 inline-flex min-h-[44px] items-center px-1 text-[13px] text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Continue read-only
        </a>
      </motion.div>
    </section>
  );
}
