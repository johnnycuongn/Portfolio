'use client'

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { PROJECTS } from '../PORTFOLIO';
import ProjectCard from './ProjectCard';
import './ProjectRail.css';

const pad = (n: number) => String(n).padStart(2, '0');

const ProjectRail = () => {
  const railRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // `visible` is the fraction of the content in frame — it becomes the
  // progress thumb's width, so the bar reads as a real scrollbar.
  const [visible, setVisible] = useState(1);
  const [ratio, setRatio] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const sync = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setVisible(el.scrollWidth > 0 ? el.clientWidth / el.scrollWidth : 1);
    setRatio(max > 0 ? el.scrollLeft / max : 0);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sync]);

  const scrollByCard = (direction: number) => {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-rail-card]');
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const step = (card?.offsetWidth ?? el.clientWidth) + gap;
    el.scrollBy({
      left: direction * step,
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  };

  const index = Math.round(ratio * (PROJECTS.length - 1)) + 1;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={railRef}
          onScroll={sync}
          role="region"
          aria-label="Projects"
          tabIndex={0}
          className="rail-scroller flex h-full snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain md:gap-6"
        >
          {PROJECTS.map((project, i) => (
            <ProjectCard
              key={project.id}
              index={i}
              projectId={project.id}
              className="rail-card snap-start"
            />
          ))}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-slate-900"
        />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <span className="font-mono text-xs tracking-widest text-gray-400">
          {pad(index)} / {pad(PROJECTS.length)}
        </span>
        <div aria-hidden className="relative h-0.5 flex-1 rounded-full bg-white/10">
          <div
            className="absolute inset-y-0 rounded-full bg-teal-300"
            style={{
              width: `${visible * 100}%`,
              left: `${ratio * (1 - visible) * 100}%`
            }}
          />
        </div>
        <div className="hidden gap-2 [@media(pointer:fine)]:flex">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            disabled={atStart}
            aria-label="Previous project"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-gray-300 transition-colors hover:border-teal-300 hover:text-teal-300 disabled:pointer-events-none disabled:opacity-25"
          >
            <FiArrowLeft />
          </button>
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            disabled={atEnd}
            aria-label="Next project"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-gray-300 transition-colors hover:border-teal-300 hover:text-teal-300 disabled:pointer-events-none disabled:opacity-25"
          >
            <FiArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectRail;
