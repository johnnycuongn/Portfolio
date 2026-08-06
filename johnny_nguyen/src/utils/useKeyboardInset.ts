'use client'

import { useEffect, useState } from 'react';

// Address bars and toolbars also eat into the visual viewport, but only by a few
// dozen pixels. Nothing that small is a keyboard, and reacting to it would make
// anchored elements twitch as the browser chrome slides around.
const KEYBOARD_MIN = 80;

/**
 * How much of the bottom of the layout viewport the on-screen keyboard covers,
 * and how much height is left above it.
 *
 * Mobile browsers open the keyboard *over* the page rather than resizing it:
 * `position: fixed; bottom: 0` stays pinned to a layout viewport that now runs
 * on behind the keyboard, and `dvh` doesn't shrink either — so anything docked
 * to the bottom edge, like the chat's input, ends up underneath it. The visual
 * viewport is the only thing that reports the region still on screen.
 *
 * Both numbers are 0 on a desktop and on a phone with the keyboard closed, so
 * callers can leave their normal CSS in charge until there is something to
 * avoid.
 */
const useKeyboardInset = () => {
  const [inset, setInset] = useState(0);
  const [visibleHeight, setVisibleHeight] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const read = () => {
      // offsetTop matters as much as height: to reveal a focused field the
      // browser may scroll the visual viewport across the layout viewport, and
      // whatever is dodging the keyboard has to travel with it.
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      const keyboard = covered > KEYBOARD_MIN;
      setInset(keyboard ? Math.round(covered) : 0);
      setVisibleHeight(keyboard ? Math.round(viewport.height) : 0);
    };

    read();
    viewport.addEventListener('resize', read);
    viewport.addEventListener('scroll', read);
    return () => {
      viewport.removeEventListener('resize', read);
      viewport.removeEventListener('scroll', read);
    };
  }, []);

  return { inset, visibleHeight };
};

export default useKeyboardInset;
