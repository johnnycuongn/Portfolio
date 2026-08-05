'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CHAT } from '../PORTFOLIO';
import { MAX_MESSAGE_CHARS } from '@/app/_ai/types';
import useChat from '@/utils/useChat';

const GLOW = 'radial-gradient(circle, rgba(230,255,150,1) 0%, rgba(230,255,150,0.8) 25%, rgba(230,255,150,0.4) 50%, rgba(230,255,150,0) 75%)';

function FireflyDot({ size = 8, fast = false }: { size?: number; fast?: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      animate={reduceMotion ? undefined : { scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
      transition={reduceMotion ? undefined : { duration: fast ? 0.7 : 2, ease: 'easeInOut', repeat: Infinity }}
      style={{
        display: 'block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#fddba3',
        backgroundImage: GLOW,
        boxShadow: '0 0 10px 5px rgba(230,255,150,0.3)',
      }}
    />
  );
}

export default function FireflyChat() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const { messages, isStreaming, hasHistory, send, clear } = useChat();
  const reduceMotion = useReducedMotion();

  const panelRef = useRef<HTMLDivElement>(null);
  const beaconRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  // Focus the input on open; hand focus back to the beacon on close. The ref guard
  // stops the initial render from stealing focus on page load.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
    else if (wasOpen.current) beaconRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  // Land at the bottom the moment the panel opens (an instant jump, not a smooth
  // scroll from the top over a restored transcript), then keep pinned to the
  // bottom as new messages arrive. Smooth-scroll only for a settled reply while
  // already open; mid-stream (one update per token) and reduced-motion both fall
  // back to an instant jump so the list never stacks overlapping animations.
  const scrolledSinceOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      scrolledSinceOpen.current = false;
      return;
    }
    const instant = reduceMotion || isStreaming || !scrolledSinceOpen.current;
    listEndRef.current?.scrollIntoView({
      behavior: instant ? 'auto' : 'smooth',
      block: 'end',
    });
    scrolledSinceOpen.current = true;
  }, [messages, isStreaming, reduceMotion, open]);

  // Esc closes. Tab cycles within the panel rather than escaping to the page.
  const onPanelKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;

    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  // The draft is only cleared once `send` reports the message was actually
  // accepted — typing a follow-up mid-stream is rejected (and the disabled
  // input/chips below make that the normal, visible case) rather than
  // silently wiping what was typed.
  const submit = useCallback(
    (text: string) => {
      if (send(text)) setDraft('');
    },
    [send],
  );

  return (
    <>
      <motion.button
        ref={beaconRef}
        type="button"
        aria-label={open ? CHAT.closeLabel : CHAT.openLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-[200] flex h-11 w-11 items-center justify-center rounded-full"
        // One quiet nudge after 8s, matching the nav's idle personality.
        animate={reduceMotion ? undefined : { y: [0, 0, -6, 0] }}
        transition={reduceMotion ? undefined : { duration: 8.6, times: [0, 0.93, 0.97, 1] }}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.92 }}
      >
        <FireflyDot size={14} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label={CHAT.dialogLabel}
            onKeyDown={onPanelKeyDown}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 20 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            style={{ transformOrigin: 'bottom right', boxShadow: '0 0 40px rgba(230,255,150,0.08)' }}
            className="fixed inset-x-0 bottom-0 z-[200] flex h-[85dvh] flex-col rounded-t-2xl bg-slate-800 text-white sm:inset-x-auto sm:bottom-20 sm:right-6 sm:h-[480px] sm:w-[360px] sm:rounded-2xl"
          >
            <header className="flex shrink-0 items-center gap-2 px-4 py-3">
              <FireflyDot size={8} fast={isStreaming} />
              <span className="text-sm text-gray-300">{CHAT.name}</span>
              <div className="ml-auto flex items-center gap-3">
                {hasHistory && (
                  <button
                    type="button"
                    onClick={clear}
                    className="text-xs text-gray-400 transition-colors hover:text-teal-300"
                  >
                    {CHAT.clearLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={CHAT.closeLabel}
                  className="text-gray-400 transition-colors hover:text-teal-300"
                >
                  ✕
                </button>
              </div>
            </header>

            <div
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2"
              style={{ overscrollBehavior: 'contain' }}
              aria-live="polite"
            >
              {!hasHistory && (
                <>
                  <p className="text-sm leading-6 text-gray-300">{CHAT.greeting}</p>
                  <ul className="flex flex-wrap gap-2">
                    {CHAT.chips.map((chip) => (
                      <li key={chip.label}>
                        <button
                          type="button"
                          onClick={() => submit(chip.question)}
                          disabled={isStreaming}
                          className="rounded-full bg-teal-400/10 px-3 py-1 text-xs leading-5 text-teal-300 transition-colors hover:bg-teal-400/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-teal-400/10"
                        >
                          {chip.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {messages.map((message) =>
                message.role === 'user' ? (
                  <p
                    key={message.id}
                    className="ml-auto w-fit max-w-[85%] rounded-2xl bg-teal-400/10 px-3 py-2 text-sm leading-6 text-teal-300"
                  >
                    {message.text}
                  </p>
                ) : (
                  <div key={message.id} className="flex max-w-[90%] gap-2">
                    <span className="mt-2 shrink-0">
                      <FireflyDot size={6} fast={isStreaming && !message.text} />
                    </span>
                    <div>
                      <p className="text-sm leading-6 text-gray-200">{message.text}</p>
                      {message.action && (
                        <a
                          href={message.action.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-teal-300 hover:underline"
                        >
                          {message.action.label} →
                        </a>
                      )}
                    </div>
                  </div>
                ),
              )}
              <div ref={listEndRef} />
            </div>

            <form
              className="shrink-0 px-4 pb-3 pt-1"
              onSubmit={(event) => {
                event.preventDefault();
                submit(draft);
              }}
            >
              <input
                ref={inputRef}
                value={draft}
                maxLength={MAX_MESSAGE_CHARS}
                disabled={isStreaming}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={CHAT.placeholder}
                aria-label={CHAT.placeholder}
                className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:ring-1 focus:ring-teal-400/40 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="mt-2 text-center text-[10px] text-gray-500">{CHAT.privacyNote}</p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
