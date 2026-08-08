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
 * with a compressed hero, and an answer state where the input has settled at
 * the bottom and each reply is a full-viewport slide. The handoff is
 * sequential rather than a shared-layout morph: the landing tree fully exits
 * (via `onExitComplete`) before the bottom bar mounts, so there is never a
 * moment with two live inputs on screen.
 */
function AskPage() {
  const { turns, current, isStreaming, send, clear } = useAsk();
  const { open: openResume, isOpen: resumeOpen } = useResumeViewer();
  const { inset: keyboardInset } = useKeyboardInset();
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  /** True only across a live stream's settling edge — see the effect below. */
  const wasStreaming = useRef(false);

  const landing = current === null;

  // onExitComplete fires for BOTH directions of the landing/answer swap. Only
  // the landing tree's departure should arm the bottom bar — after Clear it is
  // the ANSWER tree exiting, and landing is true again by the time this fires.
  const landingRef = useRef(landing);
  landingRef.current = landing;

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

  // True once the landing tree has fully exited — the bottom bar waits for
  // this instead of sharing a layoutId with the landing input, so the two
  // never co-exist mid-transition.
  const [landingGone, setLandingGone] = useState(false);

  // Set once, on the render where `landing` first flips false: whether this
  // handoff is a genuinely new question (no turn has settled into `turns`
  // yet — a live turn is only appended once its stream settles) or a
  // page-load restore (turns were already hydrated before this transition
  // happened). Captured here, before `landingGone` itself can flip, so the
  // two cases stay distinguishable by the time the bar actually mounts.
  const restoredMount = useRef<boolean | null>(null);
  useEffect(() => {
    if (landing || restoredMount.current !== null) return;
    restoredMount.current = turns.length > 0 && !landingGone;
  }, [landing, turns.length, landingGone]);

  const showBar = !landing && (landingGone || Boolean(reduceMotion));

  // The bottom bar's one focus grab: a visitor who just asked their first
  // question should land back in the input with the caret ready, not have to
  // click it again. A page reload that restores a past conversation must NOT
  // steal focus the same way, hence the `restoredMount` fence above.
  useEffect(() => {
    if (!showBar || restoredMount.current) return;
    inputRef.current?.focus();
  }, [showBar]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (send(draft)) setDraft('');
  };

  const ask = (question: string) => {
    if (send(question)) setDraft('');
  };

  const handleClear = () => {
    clear();
    setLandingGone(false);
    restoredMount.current = null;
  };

  // While streaming, `current` is not yet in `turns`, so every settled turn
  // belongs in the trail; once settled, the last turn IS the slide on stage
  // and its recap would duplicate what the visitor is reading.
  const trailTurns = isStreaming ? turns : turns.slice(0, -1);

  const inputBar = (
    <motion.form onSubmit={submit} className="flex w-full max-w-2xl items-center gap-3">
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
    // The viewer sits outside <main> so that marking the page inert — which is
    // what keeps a screen reader out of the dimmed page behind — cannot reach
    // the dialog itself. React 19 takes `inert` as a plain boolean prop.
    <>
      <main className="fixed inset-0 flex flex-col overflow-hidden bg-slate-900" inert={resumeOpen}>
        <AnimatePresence onExitComplete={() => { if (!landingRef.current) setLandingGone(true); }}>
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
                  onClick={handleClear}
                  className="text-xs text-gray-600 transition-colors hover:text-teal-300"
                >
                  {ASK.clearLabel}
                </button>
              </div>
              <HistoryTrail turns={trailTurns} />

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

        {showBar && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center px-6 pb-5 pt-2"
            style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 8 : undefined }}
          >
            {inputBar}
          </motion.div>
        )}
      </main>
      <ResumeViewer />
    </>
  );
}

export default function AskRoute() {
  return (
    <ResumeViewerProvider>
      <AskPage />
    </ResumeViewerProvider>
  );
}
