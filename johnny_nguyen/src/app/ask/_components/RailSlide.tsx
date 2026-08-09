'use client';

import { motion, useReducedMotion } from 'motion/react';
import { parseRailCards } from '@/app/_ai/slides';
import type { ChatAction } from '@/app/_ai/types';
import { ASK } from '@/app/PORTFOLIO';
import EditorialSlide from './EditorialSlide';
import SlideAction from './SlideAction';
import SlideRail from './SlideRail';

/**
 * The model's rail format: "- Title | detail" lines become image-less cards.
 * A reply that never card-shapes falls back to the Editorial rendering of the
 * full text — same safe failure as every other malformed shape.
 */
export default function RailSlide({
  question,
  text,
  action,
}: {
  question: string;
  text: string;
  action?: ChatAction;
}) {
  const reduceMotion = useReducedMotion();
  const { headline, cards } = parseRailCards(text);

  if (cards.length === 0) return <EditorialSlide question={question} text={text} action={action} />;

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
      <SlideRail
        ariaLabel={ASK.slideLabel}
        cards={cards.map((card, index) => ({
          // Streamed cards append-only; index keys keep the growing last card stable.
          key: String(index),
          title: card.title || undefined,
          body: card.body,
        }))}
      />
      <SlideAction action={action} />
    </div>
  );
}
