'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { parseSlideBody } from '@/app/_ai/slides';
import { ASK, TimelineData } from '@/app/PORTFOLIO';

/**
 * The timeline as a deck-within-the-deck: one role at a time at slide scale,
 * stepped with the dot-axis, arrows, or arrow keys. TimelineData is most-recent
 * first; the axis runs oldest → newest left to right, so it is reversed here.
 */
const ROLES = [...TimelineData].reverse();

export default function ExperienceSlide({ question, text }: { question: string; text: string }) {
  const reduceMotion = useReducedMotion();
  const { headline } = parseSlideBody(text);
  // Start on the newest role — the one visitors ask about.
  const [index, setIndex] = useState(ROLES.length - 1);
  const role = ROLES[index];

  const step = useCallback(
    (delta: number) => setIndex((i) => Math.min(ROLES.length - 1, Math.max(0, i + delta))),
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Arrows must not steal the caret from the always-present ask input.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  return (
    <div className="flex h-full flex-col justify-center gap-4 px-8 md:px-24">
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xs uppercase tracking-[0.2em] text-teal-300"
      >
        {ASK.kickerPrefix} · {question}
      </motion.p>
      {headline && (
        <h2 className="max-w-4xl text-2xl font-bold leading-tight text-white md:text-4xl">{headline}</h2>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={role.company}
          initial={reduceMotion ? false : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, x: -16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="mt-2 flex flex-col gap-2"
        >
          <p className="text-xl font-bold text-white md:text-3xl">
            {role.title} · <span className="text-teal-300">{role.company}</span>
          </p>
          <p className="text-sm text-gray-500">{role.year}</p>
          <p className="max-w-2xl text-sm leading-relaxed text-gray-400 md:text-base">{role.content}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {role.stacks.map((stack) => (
              <span key={stack} className="rounded-full bg-teal-400/10 px-3 py-1 text-xs text-teal-300">
                {stack}
              </span>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-4 flex max-w-2xl items-center gap-4">
        <button
          type="button"
          aria-label="Earlier role"
          onClick={() => step(-1)}
          disabled={index === 0}
          className="text-lg text-gray-400 transition-colors hover:text-teal-300 disabled:opacity-30"
        >
          ‹
        </button>
        <div className="relative h-px flex-1 bg-slate-700">
          {ROLES.map((r, i) => (
            <button
              key={r.company}
              type="button"
              aria-label={`${r.title} at ${r.company}`}
              onClick={() => setIndex(i)}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-2"
              style={{ left: `${ROLES.length === 1 ? 50 : (i / (ROLES.length - 1)) * 100}%`, top: '50%' }}
            >
              <span
                className={
                  i === index
                    ? 'block h-2.5 w-2.5 rounded-full bg-teal-300 shadow-[0_0_8px_2px_rgba(94,234,212,0.4)]'
                    : 'block h-2 w-2 rounded-full bg-slate-600 transition-colors hover:bg-slate-400'
                }
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Later role"
          onClick={() => step(1)}
          disabled={index === ROLES.length - 1}
          className="text-lg text-gray-400 transition-colors hover:text-teal-300 disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="flex max-w-2xl justify-between px-8 text-[10px] text-gray-600">
        <span>{ROLES[0].axisLabel ?? ROLES[0].year}</span>
        <span className="text-teal-300">{ROLES[ROLES.length - 1].axisLabel ?? ROLES[ROLES.length - 1].year}</span>
      </div>
    </div>
  );
}
