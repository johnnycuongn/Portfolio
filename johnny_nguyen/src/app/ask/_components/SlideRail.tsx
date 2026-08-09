'use client';

import { useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useReducedMotion } from 'motion/react';

export interface RailCardItem {
  key: string;
  title?: string;
  body: string;
  image?: string;
  href?: string;
  pills?: string[];
}

/**
 * The slide-native horizontal rail: snap-scrolling cards, ~2.5 visible with
 * the next peeking in as the scroll cue. Sideways only — the page's vertical
 * lock is untouched. ‹ › and arrow keys nudge card-by-card; native
 * trackpad/touch scrolling works as-is.
 */
export default function SlideRail({ cards, ariaLabel }: { cards: RailCardItem[]; ariaLabel: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const nudge = useCallback(
    (direction: 1 | -1) => {
      const rail = railRef.current;
      if (!rail) return;
      const card = rail.querySelector<HTMLElement>('[data-rail-card]');
      const step = card ? card.offsetWidth + 16 : rail.clientWidth / 2;
      rail.scrollBy({ left: direction * step, behavior: reduceMotion ? 'auto' : 'smooth' });
    },
    [reduceMotion],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Arrows must not steal the caret from the always-present ask input.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowLeft') nudge(-1);
      if (event.key === 'ArrowRight') nudge(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nudge]);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => nudge(-1)}
        className="shrink-0 text-lg text-gray-400 transition-colors hover:text-teal-300"
      >
        ‹
      </button>
      <div
        ref={railRef}
        aria-label={ariaLabel}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden pb-2 [scrollbar-width:thin]"
      >
        {cards.map((card) => (
          <div
            key={card.key}
            data-rail-card
            className="w-64 shrink-0 snap-start rounded-lg bg-slate-800 p-4 md:w-72"
          >
            {card.image && (
              <div className="relative mb-3 h-28 w-full overflow-hidden rounded bg-slate-700">
                <Image src={card.image} alt={card.title ?? ''} fill className="object-cover" sizes="18rem" />
              </div>
            )}
            {card.title &&
              (card.href ? (
                <a
                  href={card.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-base font-bold text-white transition-colors hover:text-teal-300"
                >
                  {card.title} ↗
                </a>
              ) : (
                <p className="text-base font-bold text-white">{card.title}</p>
              ))}
            <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-gray-400">{card.body}</p>
            {card.pills && card.pills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {card.pills.map((pill) => (
                  <span key={pill} className="rounded-full bg-teal-400/10 px-2.5 py-0.5 text-xs text-teal-300">
                    {pill}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => nudge(1)}
        className="shrink-0 text-lg text-gray-400 transition-colors hover:text-teal-300"
      >
        ›
      </button>
    </div>
  );
}
