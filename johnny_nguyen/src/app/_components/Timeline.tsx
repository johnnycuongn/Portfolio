'use client'

import { useCallback, useRef, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { TimelineData } from '../PORTFOLIO';
import TimelineCard from './TimelineCard';
import ViewSwitch from './ViewSwitch';
import useRail from '@/utils/useRail';
import useViewMode from '@/utils/useViewMode';
import useIsDesktop from '@/utils/useIsDesktop';
import './Rail.css';

const Timeline = () => {
  const { railRef, visible, ratio, atStart, atEnd, contentWidth, sync, scrollByCard, scrollToCard, reduceMotion } = useRail();
  const { mode, toggle } = useViewMode();
  const isDesktop = useIsDesktop();
  const [hovered, setHovered] = useState<number | null>(null);
  // Mirrors `hovered` synchronously (ref writes aren't batched like state)
  // so TimelineCard's hover-end guard can check the live value mid-event,
  // before this component re-renders. See TimelineCard.tsx.
  const hoveredRef = useRef<number | null>(null);

  const handleHover = useCallback((index: number | null) => {
    hoveredRef.current = index;
    setHovered(index);
  }, []);

  // Which job is currently centred in frame. Mirrors how the Projects rail
  // derives its counter from scroll progress.
  const active = Math.round(ratio * (TimelineData.length - 1));
  // Line mode needs 512px of card area — two rows of cards either side of the
  // hairline — which no phone has. Below `md:` the rail is the only view, and
  // the switch is hidden rather than disabled. A stored preference is left
  // untouched, so a visitor who chose line on a desktop still gets it there.
  const isLine = mode === 'line' && isDesktop;

  return (
    <MotionConfig
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 420, damping: 38 }
      }
    >
      <div className="flex h-full w-full flex-col">
        <header className="flex shrink-0 items-center gap-4 py-4">
          <h2 className="text-4xl tracking-tight">Experience</h2>
          {/*
            Hidden by CSS rather than by `isDesktop` so it never flickers in on
            hydration. The wrapper carries the display utilities — putting
            `hidden md:flex` on the button itself would collide with its own
            `flex` class, and which one wins depends on CSS source order.
          */}
          <span className="hidden md:block">
            <ViewSwitch mode={mode} onToggle={toggle} reduceMotion={!!reduceMotion} />
          </span>
        </header>
        {/*
          Cards stretch to the scroller's height, which is how they end up equal
          without measuring anything in JS. The cap keeps text-only cards from
          stretching to the full height of a screen-tall section.
        */}
        <div className="relative flex min-h-0 flex-1 items-center">
          <div
            ref={railRef}
            onScroll={sync}
            role="region"
            aria-label="Experience"
            tabIndex={0}
            className={
              // `overflow-y-hidden` is load-bearing: setting only overflow-x
              // makes CSS compute the unset overflow-y as `auto`, so on a
              // viewport too short for line mode's fixed 36rem wrapper the card
              // area would become a vertical scroller and the lower row could
              // be scrolled out of view. Clipping is the intended failure mode.
              'rail-scroller h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain ' +
              // Line mode's wrapper is a fixed 36rem (two 17rem cards either
              // side of the line); the cap has to clear it or the lower row of
              // cards is clipped. Rail mode keeps its own 26rem cap.
              (isLine ? 'max-h-[36rem]' : 'max-h-[26rem]')
            }
          >
            {/*
              The cards' layout lives on this wrapper, not the scroller, so that
              it is sized by its content rather than by the viewport. That makes
              it the right positioning context for the timeline line, which must
              span the whole scrollable width — an absolute child of the scroller
              would only span the visible part.
            */}
            <div className={
              'relative flex min-w-full gap-4 md:gap-6 ' +
              (isLine ? 'h-[36rem] items-start' : 'h-full items-stretch')
            }>
              {/*
                Waiting on the measurement matters: the line carries a
                `layoutId`, so mounting it at width 0 and widening it once
                `contentWidth` arrives reads as a layout animation — the
                hairline would spring open from a point on every load of the
                default view. Mounting it already at full width one frame after
                paint is imperceptible by comparison.
              */}
              {isLine && contentWidth > 0 && (
                <motion.span
                  layoutId="experience-line"
                  // Only re-measure when the mode changes. Without this the
                  // line animates its width on every resize tick, springing
                  // along behind the window edge as `contentWidth` updates.
                  layoutDependency={isLine}
                  aria-hidden
                  // This wrapper is a block-level flex container in a block
                  // scroller, so its used width is the scroller's content box —
                  // `inset-x-0` would only span one viewport. The scrollable
                  // width has to come from the hook's measurement instead. (An
                  // intrinsic width on the wrapper is not an option: .rail-card
                  // sizes off a percentage flex-basis and would collapse.)
                  style={{ width: contentWidth }}
                  className="pointer-events-none absolute left-0 top-1/2 block h-px -translate-y-1/2 bg-white/50"
                />
              )}
              {TimelineData.map((job, i) => (
                <TimelineCard
                  key={`${job.company}-${job.year}`}
                  job={job}
                  className="rail-card snap-start"
                  dimmed={hovered !== null && hovered !== i}
                  index={i}
                  onHover={handleHover}
                  hoveredRef={hoveredRef}
                  // The *effective* mode, not the stored one — below `md:` the
                  // rail wins regardless of preference, and a card rendering
                  // line geometry inside a rail container would break the layout.
                  mode={isLine ? 'line' : 'rail'}
                  reduceMotion={!!reduceMotion}
                />
              ))}
            </div>
          </div>
          <div
            aria-hidden
            className={
              'pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-slate-900 transition-opacity ' +
              (atEnd ? 'opacity-0' : 'opacity-100')
            }
          />
        </div>

        <div className="mt-6 flex items-start gap-4">
          {/*
            The track is the timeline line, the scrollbar, and the year axis at
            once: the teal fill is the window currently in frame, and each dot
            marks a job's place along the whole span. `pb-8` reserves room for
            the absolutely-positioned labels, which contribute no layout height.
          */}
          {isLine ? <div className="flex-1" /> : (
          <div className="relative flex-1 pb-8">
            <motion.div layoutId="experience-line" aria-hidden className="relative h-px w-full rounded-full bg-white/10">
              <div
                className="absolute inset-y-0 rounded-full bg-teal-300"
                style={{
                  width: `${visible * 100}%`,
                  left: `${ratio * (1 - visible) * 100}%`
                }}
              />
            </motion.div>
            {TimelineData.map((job, i) => (
              <button
                key={`${job.company}-${job.year}`}
                type="button"
                onClick={() => scrollToCard(i)}
                aria-label={`Go to ${job.title} at ${job.company}, ${job.axisLabel ?? job.year}`}
                aria-current={i === active}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-2"
                // Each job owns an equal share of the track; the dot marks the
                // centre of its share, which keeps the first and last labels
                // clear of the track's ends.
                style={{ left: `${((i + 0.5) / TimelineData.length) * 100}%` }}
              >
                <motion.span
                  layoutId={`experience-tick-${i}`}
                  // The active tick's growth has to be a Framer value, not a
                  // Tailwind `scale-*`: this node is layout-projected, so Framer
                  // owns its inline `transform` (and writes `transform: none`
                  // at rest), which beats any transform utility. A
                  // `transition-all` here would also CSS-transition the
                  // transform Framer rewrites each frame and smear the morph.
                  animate={{ scale: i === active && !reduceMotion ? 1.5 : 1 }}
                  className={
                    '-mt-[2.5px] block h-1.5 w-1.5 rounded-full transition-colors duration-200 ' +
                    (i === active ? 'bg-teal-300' : 'bg-white/25')
                  }
                />
                <span
                  className={
                    'whitespace-nowrap font-mono text-xs tracking-widest transition-colors duration-200 ' +
                    (i === active ? 'text-teal-300' : 'text-gray-500')
                  }
                >
                  {job.axisLabel ?? job.year}
                </span>
              </button>
            ))}
          </div>
          )}
          {/*
            A plain mouse wheel only emits deltaY, and every wheel event over the
            rail is forwarded to the page (see the wheel handler in useRail) — so
            a desktop user without a trackpad has no wheel-driven way to scroll
            the rail. These arrows (and arrow-key scrolling) are their only means;
            treat this block as functionally load-bearing, not decorative.
          */}
          <div className="hidden gap-2 [@media(pointer:fine)]:flex">
            <button
              type="button"
              onClick={() => scrollByCard(-1)}
              disabled={atStart}
              aria-label="Previous job"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-gray-300 transition-colors hover:border-teal-300 hover:text-teal-300 disabled:pointer-events-none disabled:opacity-25"
            >
              <FiArrowLeft />
            </button>
            <button
              type="button"
              onClick={() => scrollByCard(1)}
              disabled={atEnd}
              aria-label="Next job"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-gray-300 transition-colors hover:border-teal-300 hover:text-teal-300 disabled:pointer-events-none disabled:opacity-25"
            >
              <FiArrowRight />
            </button>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
};

export default Timeline;
