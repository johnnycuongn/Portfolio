'use client'

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Shared behavior for the site's horizontal rails (Projects, Experience):
 * scroll-position state for the progress bar, wheel forwarding, and
 * card-stepped scrolling. Rails consume this so they cannot drift apart.
 *
 * Cards inside the scroller must carry a `data-rail-card` attribute —
 * `scrollByCard` and `scrollToCard` locate them by it.
 */
const useRail = () => {
  const railRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // `visible` is the fraction of the content in frame — it becomes the
  // progress thumb's width, so the bar reads as a real scrollbar.
  const [visible, setVisible] = useState(1);
  const [ratio, setRatio] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  // The full scrollable width of the content. A rail that draws something
  // spanning the whole track (Experience's timeline line) needs this as an
  // explicit pixel width: an absolutely-positioned child can only stretch to
  // its containing block, which here is only one viewport wide.
  const [contentWidth, setContentWidth] = useState(0);

  const sync = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setContentWidth(el.scrollWidth);
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

  // Chrome redirects vertical wheel deltas into horizontally-scrollable
  // containers, and a rail's `overscroll-behavior-x: contain` then stops
  // them chaining onward — so a vertical gesture over a rail gets swallowed
  // and never reaches the page's section-snap handler. Forward vertical
  // intent to the window explicitly; horizontal intent falls through to the
  // scroller untouched.
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      // deltaY is only in pixels when deltaMode is DOM_DELTA_PIXEL. Firefox
      // reports DOM_DELTA_LINE for physical mouse wheels; forwarding the raw
      // value there would scroll ~19x too little and the page's debounced snap
      // would pull it straight back.
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      window.scrollBy({ top: e.deltaY * factor });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const scrollByCard = useCallback((direction: number) => {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-rail-card]');
    // The gap lives on whichever element actually lays the cards out — the
    // scroller itself in Projects, an inner content wrapper in Experience
    // (which needs a content-sized positioning context for its timeline line).
    const gap = parseFloat(getComputedStyle(card?.parentElement ?? el).columnGap) || 0;
    const step = (card?.offsetWidth ?? el.clientWidth) + gap;
    el.scrollBy({
      left: direction * step,
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  }, [reduceMotion]);

  const scrollToCard = useCallback((index: number) => {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelectorAll<HTMLElement>('[data-rail-card]')[index];
    // `block: 'nearest'` keeps this from fighting the page's fixed-position
    // sections — the same guard ProjectCard uses on focus.
    card?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      inline: 'start',
      block: 'nearest'
    });
  }, [reduceMotion]);

  return { railRef, visible, ratio, atStart, atEnd, contentWidth, sync, scrollByCard, scrollToCard, reduceMotion };
};

export default useRail;
