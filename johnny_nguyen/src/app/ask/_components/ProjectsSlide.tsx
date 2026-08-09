'use client';

import { motion, useReducedMotion } from 'motion/react';
import { parseSlideBody } from '@/app/_ai/slides';
import { ASK, PROJECTS } from '@/app/PORTFOLIO';
import SlideRail from './SlideRail';

/** The projects takeover: the main page's rail idea at slide scale. */
export default function ProjectsSlide({ question, text }: { question: string; text: string }) {
  const reduceMotion = useReducedMotion();
  const { headline } = parseSlideBody(text);

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
        cards={PROJECTS.map((project) => ({
          key: project.id,
          title: project.title,
          body: project.description,
          image: project.image,
          href: project.github,
          pills: project.stacks,
        }))}
      />
    </div>
  );
}
