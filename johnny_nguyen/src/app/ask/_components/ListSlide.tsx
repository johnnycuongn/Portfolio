'use client';

import { motion, useReducedMotion } from 'motion/react';
import { parseSlideBody } from '@/app/_ai/slides';
import type { ChatAction } from '@/app/_ai/types';
import { ASK } from '@/app/PORTFOLIO';
import SlideAction from './SlideAction';

/**
 * For answers that are naturally a set: headline streams in, then each settled
 * line pops in as a teal pill — the site's existing pill language at slide scale.
 */
export default function ListSlide({
  question,
  text,
  action,
}: {
  question: string;
  text: string;
  action?: ChatAction;
}) {
  const reduceMotion = useReducedMotion();
  const { headline, items } = parseSlideBody(text);

  return (
    <div className="flex h-full flex-col justify-center gap-6 px-8 md:px-24">
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xs uppercase tracking-[0.2em] text-teal-300"
      >
        {ASK.kickerPrefix} · {question}
      </motion.p>
      <h2 className="max-w-4xl text-3xl font-bold leading-tight text-white md:text-5xl">
        {headline}
      </h2>
      <div className="flex max-w-3xl flex-wrap gap-3">
        {items.map((item, index) => (
          <motion.span
            key={item}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20, delay: reduceMotion ? 0 : index * 0.05 }}
            className="rounded-full bg-teal-400/10 px-4 py-1.5 text-sm text-teal-300 md:text-base"
          >
            {item}
          </motion.span>
        ))}
      </div>
      <SlideAction action={action} />
    </div>
  );
}
