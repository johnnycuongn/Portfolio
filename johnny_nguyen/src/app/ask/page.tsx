'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ASK, CHAT, PORTFOLIO } from '../PORTFOLIO';
import { MAX_MESSAGE_CHARS } from '../_ai/types';
import FireflyDot from '../_components/FireflyDot';
import ResumeViewer from '../_components/ResumeViewer';
import useAsk from '@/utils/useAsk';
import useKeyboardInset from '@/utils/useKeyboardInset';
import useResumeViewer, { ResumeViewerProvider } from '@/utils/useResumeViewer';
import EditorialSlide from './_components/EditorialSlide';
import ListSlide from './_components/ListSlide';
import ExperienceSlide from './_components/ExperienceSlide';
import ProjectsSlide from './_components/ProjectsSlide';
import HistoryTrail from './_components/HistoryTrail';

/**
 * /ask: the portfolio behind a prompt. Two states share one input — a landing
 * with a compressed hero, and an answer state where the input has glided to
 * the bottom and each reply is a full-viewport slide. The morph between them
 * is a motion layout animation on the input's shared layoutId.
 */
function AskPage() {
  const { turns, current, isStreaming, send, clear } = useAsk();
  const { open: openResume } = useResumeViewer();
  const { inset: keyboardInset } = useKeyboardInset();
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  /** True only across a live stream's settling edge — see the effect below. */
  const wasStreaming = useRef(false);

  const landing = current === null;

  // The firefly opening the resume is the action itself on /ask — no button
  // press to wait for. It must fire only when a LIVE turn settles, never for a
  // conversation restored from storage, so the trigger is the streaming
  // true→false edge: restored state is never streaming, so it has no edge.
  useEffect(() => {
    if (wasStreaming.current && !isStreaming && current?.action?.opens === 'resume') {
      openResume();
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming, current, openResume]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (send(draft)) setDraft('');
  };

  const ask = (question: string) => {
    if (send(question)) setDraft('');
  };

  const inputBar = (
    <motion.form
      layoutId="ask-input"
      layout={reduceMotion ? false : 'position'}
      onSubmit={submit}
      className="flex w-full max-w-2xl items-center gap-3"
    >
      <FireflyDot fast={isStreaming} />
      <input
        ref={inputRef}
        value={draft}
        maxLength={MAX_MESSAGE_CHARS}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={ASK.placeholder}
        aria-label={ASK.placeholder}
        className="flex-1 rounded-full border border-slate-700 bg-slate-800 px-5 py-3 text-base text-white placeholder-gray-500 outline-none transition-colors focus:border-teal-300/50"
      />
      <button
        type="submit"
        disabled={isStreaming || !draft.trim()}
        aria-label={ASK.placeholder}
        className="text-lg text-teal-300 transition-opacity disabled:opacity-30"
      >
        ➤
      </button>
    </motion.form>
  );

  return (
    <main className="fixed inset-0 flex flex-col overflow-hidden bg-slate-900">
      <AnimatePresence>
        {landing ? (
          <motion.div
            key="landing"
            exit={reduceMotion ? undefined : { opacity: 0, y: -24, transition: { duration: 0.3 } }}
            className="flex flex-1 flex-col items-center justify-center gap-4 px-6"
          >
            <h1 className="text-center text-5xl font-bold text-white md:text-6xl">{PORTFOLIO.name}</h1>
            <p className="text-lg text-gray-300">{PORTFOLIO.role}</p>
            <p className="max-w-md text-center text-sm text-gray-400">{ASK.intro}</p>
            <div className="mt-4 flex w-full justify-center">{inputBar}</div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {CHAT.chips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => ask(chip.question)}
                  className="rounded-full bg-teal-400/10 px-4 py-1.5 text-sm text-teal-300 transition-transform hover:scale-105"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <p className="mt-6 text-xs text-gray-600">{ASK.privacyNote}</p>
            <Link href="/" className="mt-1 text-xs text-gray-500 transition-colors hover:text-teal-300">
              {ASK.backLabel} ↓
            </Link>
          </motion.div>
        ) : (
          <motion.div
            key="answer"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.3, delay: 0.15 } }}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex items-start justify-between px-8 pt-5 md:px-24">
              <Link href="/" className="text-xs text-gray-400 transition-colors hover:text-teal-300">
                {PORTFOLIO.name} ✦
              </Link>
              <button
                type="button"
                onClick={clear}
                className="text-xs text-gray-600 transition-colors hover:text-teal-300"
              >
                {ASK.clearLabel}
              </button>
            </div>
            <HistoryTrail turns={turns.slice(0, -1)} />

            <section aria-label={ASK.slideLabel} aria-live="polite" className="relative flex-1 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={current.question}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, transition: { duration: 0.15 } }}
                  className="h-full"
                >
                  {current.format === 'experience' ? (
                    <ExperienceSlide question={current.question} text={current.text} />
                  ) : current.format === 'projects' ? (
                    <ProjectsSlide question={current.question} text={current.text} />
                  ) : current.format === 'list' ? (
                    <ListSlide question={current.question} text={current.text} action={current.action} />
                  ) : (
                    <EditorialSlide question={current.question} text={current.text} action={current.action} />
                  )}
                </motion.div>
              </AnimatePresence>
              {/* Long answers fade out rather than scroll — the page never grows. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-900 to-transparent" />
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {!landing && (
        <div
          className="flex justify-center px-6 pb-5 pt-2"
          style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 8 : undefined }}
        >
          {inputBar}
        </div>
      )}
      <ResumeViewer />
    </main>
  );
}

export default function AskRoute() {
  return (
    <ResumeViewerProvider>
      <AskPage />
    </ResumeViewerProvider>
  );
}
