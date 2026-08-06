'use client';

import { useCallback } from 'react';
import type { KeyboardEvent, RefObject } from 'react';

const FOCUSABLE = 'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Cycles Tab within an open overlay instead of letting it escape to the page
 * behind. Returns a keydown handler for the container; the caller owns Escape,
 * since what closing means differs per overlay.
 */
export default function useFocusTrap(containerRef: RefObject<HTMLElement | null>) {
  return useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !containerRef.current) return;

      const focusable = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [containerRef],
  );
}
