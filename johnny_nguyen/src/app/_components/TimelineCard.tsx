'use client'

import { motion, useAnimation } from 'motion/react';
import { FC, memo, RefObject } from 'react';
import { FiExternalLink } from 'react-icons/fi';
import { JobTimeLineItem } from '../PORTFOLIO';
import useDelayedLinkOpen, { canDelayOpen } from '@/utils/useDelayLinkOpen';
import { ViewMode } from '@/utils/useViewMode';

interface TimelineCardProps {
  job: JobTimeLineItem;
  className?: string;
  dimmed: boolean;
  index: number;
  onHover: (index: number | null) => void;
  // Mirrors Timeline's `hovered` state synchronously — refs update the
  // instant a neighbour's hover-start fires, before React re-renders — so
  // this card's hover-end can tell whether a neighbour already claimed
  // hover before blindly clearing it. See Timeline.tsx's `handleHover`.
  hoveredRef: RefObject<number | null>;
  mode: ViewMode;
  // Comes from Timeline's `useRail()` so the whole section reads one value
  // rather than each card resolving the media query for itself.
  reduceMotion: boolean;
}

const TimelineCard: FC<TimelineCardProps> = memo(({ job, className, dimmed, index, onHover, hoveredRef, mode, reduceMotion }) => {
  const controls = useAnimation();
  const { navigating, navigate } = useDelayedLinkOpen(200);

  const handleClick = async (e: React.MouseEvent) => {
    // Leave the anchor to open the tab itself wherever the deferred open would
    // be blocked or is pointless — see canDelayOpen.
    if (!canDelayOpen(e, reduceMotion)) return;

    e.preventDefault();
    if (navigating) return;

    await controls.start({
      x: '100%',
      y: '-100%',
      opacity: 0,
      transition: { duration: 0.5 }
    });
    navigate(job.link);
    setTimeout(async () => {
      await controls.start({
        x: 0,
        y: 0,
        opacity: 1,
        transition: { duration: 0.5 }
      });
    }, 2000);
  };

  const isLine = mode === 'line';
  // nth-child(odd) sat above the line in the original CSS, and nth-child is
  // 1-based — so even indices are the ones that go above.
  const above = index % 2 === 0;

  return (
    <motion.div
      data-rail-card
      onHoverStart={() => onHover(index)}
      onHoverEnd={() => {
        // Only clear if this card is still the one recorded as hovered —
        // otherwise a neighbour's hover-start already won the race.
        if (hoveredRef.current === index) onHover(null);
      }}
      animate={{ opacity: dimmed ? 0.5 : 1 }}
      whileHover={reduceMotion ? undefined : { y: -4 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              // hover lift and opacity dim — unchanged from before
              type: 'spring',
              stiffness: 300,
              damping: 24,
              // the mode morph: 80ms behind the line, then 25ms per card
              layout: {
                type: 'spring',
                stiffness: 420,
                damping: 38,
                delay: 0.08 + index * 0.025
              }
            }
      }
      layout={!reduceMotion}
      // Animate the layout only when the view mode changes — including when a
      // resize past `md:` forces rail mode. Card widths are percentage-based,
      // so without this every resize tick is a layout change and the cards
      // spring along behind the window edge instead of tracking it.
      layoutDependency={mode}
      className={
        (className ?? '') +
        ' rounded-lg bg-slate-800 shadow-lg hover:shadow-xl ' +
        (isLine
          ? 'relative h-[17rem] ' + (above ? 'self-start' : 'self-end')
          : 'overflow-hidden self-stretch')
      }
    >
      <div className="group/item relative flex h-full flex-col p-5">
        <a
          href={job.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          onFocus={(e) => e.currentTarget.scrollIntoView({
            behavior: reduceMotion ? 'auto' : 'smooth',
            inline: 'nearest',
            block: 'nearest'
          })}
          className="absolute inset-0 z-10 cursor-pointer"
          aria-label={`${job.title} at ${job.company}`}
        ></a>

        <span className="text-sm text-gray-400">{job.year}</span>

        <h3 className="mt-1 text-xl text-white transition-colors group-hover/item:text-teal-300">
          {job.title} • {job.company}
          <motion.span
            className="ml-2 inline-block align-middle"
            animate={controls}
            initial={{ x: 0, y: 0, opacity: 1 }}
          >
            <FiExternalLink />
          </motion.span>
        </h3>

        <p className={
          'mt-3 min-h-0 text-base leading-7 text-gray-300 transition-colors group-hover/item:text-white ' +
          (isLine ? 'line-clamp-3' : 'line-clamp-6')
        }>
          {job.content}
        </p>

        <div className="mt-auto flex flex-wrap gap-1 pt-4">
          {job.stacks.map((stack) => (
            <span
              key={stack}
              className="flex items-center rounded-full bg-teal-400/10 px-3 py-1 text-xs font-medium leading-5 text-teal-300"
            >
              {stack}
            </span>
          ))}
        </div>
      </div>
      {isLine && (
        <motion.span
          layoutId={`experience-tick-${index}`}
          aria-hidden
          className="absolute block h-2 w-2 rounded-full bg-[#01565b]"
          // Horizontal centring is `left` arithmetic, not `-translate-x-1/2`:
          // this node is layout-projected (layoutId), so Framer's inline
          // transform overrides any transform utility. Vertically, 16px gap to
          // the line + half the dot puts the dot's centre on the line.
          style={{ left: 'calc(50% - 4px)', ...(above ? { bottom: -20 } : { top: -20 }) }}
        />
      )}
    </motion.div>
  );
});

TimelineCard.displayName = 'TimelineCard';

export default TimelineCard;
