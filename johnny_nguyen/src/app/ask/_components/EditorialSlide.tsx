'use client';

import { motion, useReducedMotion } from 'motion/react';
import { parseSlideBody } from '@/app/_ai/slides';
import type { ChatAction } from '@/app/_ai/types';
import { ASK } from '@/app/PORTFOLIO';
import SlideAction from './SlideAction';

/**
 * The default slide: kicker (the visitor's own question), a headline at
 * presentation scale, then short dash-fragments. Tokens streaming into `text`
 * ARE the entrance animation — nothing here waits for the reply to finish.
 */
export default function EditorialSlide({
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
    <div className="flex h-full flex-col justify-center gap-5 px-8 md:px-24">
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
      {items.length > 0 && (
        <ul className="space-y-2 text-base text-gray-400 md:text-lg">
          {items.map((item) => (
            <li key={item}>— {item}</li>
          ))}
        </ul>
      )}
      <SlideAction action={action} />
    </div>
  );
}
