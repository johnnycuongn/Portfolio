import { useState, type MouseEvent } from "react";

/**
 * Whether this click can be held back while an animation plays and opened
 * afterwards by `navigate`, or whether the anchor should just be left to do its
 * own native job.
 *
 * A browser only lets a script open a tab from inside the user gesture's own
 * call stack. `navigate` opens on a timer, after the fly-away has finished — by
 * then the gesture is long over. Desktop browsers are lenient about this; iOS
 * Safari is not, and blocks it silently, so the card looks dead to the tap.
 *
 * Falling through to the anchor's own `target="_blank"` can never be blocked,
 * and preserves cmd-click, middle-click and "Open link in new tab" besides.
 */
export const canDelayOpen = (e: MouseEvent, reduceMotion: boolean | null) => {
  // Nothing to wait for, so nothing to gain by taking the click over.
  if (reduceMotion) return false;
  // Modifier and non-primary clicks mean the visitor has their own plan.
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  // The case that prompted this: touch browsers block the deferred open.
  return !window.matchMedia('(pointer: coarse)').matches;
};

const useDelayedLinkOpen = (delay: number) => {
  const [navigating, setNavigating] = useState(false);
  const [, setDestination] = useState('');

  const navigate = (url: string) => {
    setNavigating(true);
    setDestination(url);
    setTimeout(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
      setNavigating(false);
    }, delay);
  };

  return { navigating, navigate };
};

export default useDelayedLinkOpen;