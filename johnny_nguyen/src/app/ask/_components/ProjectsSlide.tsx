'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { parseSlideBody } from '@/app/_ai/slides';
import { ASK, PROJECTS } from '@/app/PORTFOLIO';

/** One project on stage at a time, stepped exactly like the experience deck. */
export default function ProjectsSlide({ question, text }: { question: string; text: string }) {
  const reduceMotion = useReducedMotion();
  const { headline } = parseSlideBody(text);
  const [index, setIndex] = useState(0);
  const project = PROJECTS[index];

  const step = useCallback(
    (delta: number) => setIndex((i) => Math.min(PROJECTS.length - 1, Math.max(0, i + delta))),
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
          key={project.id}
          initial={reduceMotion ? false : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, x: -16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="mt-2 flex max-w-3xl flex-col gap-3 md:flex-row md:items-center md:gap-6"
        >
          <div className="relative h-36 w-full overflow-hidden rounded-lg bg-slate-800 md:h-44 md:w-72 md:shrink-0">
            <Image src={project.image} alt={project.title} fill className="object-cover" sizes="(min-width: 768px) 18rem, 100vw" />
          </div>
          <div className="flex flex-col gap-2">
            <a
              href={project.github}
              target="_blank"
              rel="noreferrer"
              className="text-lg font-bold text-white transition-colors hover:text-teal-300 md:text-2xl"
            >
              {project.title} ↗
            </a>
            <p className="line-clamp-3 text-sm leading-relaxed text-gray-400">{project.description}</p>
            <div className="flex flex-wrap gap-2">
              {project.stacks.map((stack) => (
                <span key={stack} className="rounded-full bg-teal-400/10 px-3 py-1 text-xs text-teal-300">
                  {stack}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-4 flex max-w-2xl items-center gap-4">
        <button
          type="button"
          aria-label="Previous project"
          onClick={() => step(-1)}
          disabled={index === 0}
          className="text-lg text-gray-400 transition-colors hover:text-teal-300 disabled:opacity-30"
        >
          ‹
        </button>
        <div className="relative h-px flex-1 bg-slate-700">
          {PROJECTS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={p.title}
              onClick={() => setIndex(i)}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-2"
              style={{ left: `${PROJECTS.length === 1 ? 50 : (i / (PROJECTS.length - 1)) * 100}%`, top: '50%' }}
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
          aria-label="Next project"
          onClick={() => step(1)}
          disabled={index === PROJECTS.length - 1}
          className="text-lg text-gray-400 transition-colors hover:text-teal-300 disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  );
}
