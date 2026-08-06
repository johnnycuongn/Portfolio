'use client';

import { useEffect } from 'react';

/**
 * Pins the page while an overlay is open.
 *
 * `position: fixed` at the current offset is the one technique that holds
 * regardless of how the scroll was generated — touch momentum, a smooth
 * `scrollTo`, a focus jump — which is why body-scroll-lock libraries all
 * converge on it. `top` carries the offset so the pin doesn't itself move the
 * page, and unlocking restores the exact scrollY rather than trusting the
 * browser to have kept it.
 *
 * Refcounted, and that is the whole reason this is a shared module rather than
 * an effect in each overlay: the resume viewer opens from inside the chat, so
 * both are locked at once. Two independent effects would each snapshot
 * `body.style` on the way in — and the second one would record the *first*
 * one's pinned values as "previous", then restore those on close, stranding
 * the page at `position: fixed` with a negative `top`. Only the first lock
 * snapshots, only the last one restores.
 */

interface SavedStyles {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
  rootOverflow: string;
}

let lockCount = 0;
let saved: SavedStyles | null = null;
let savedScrollY = 0;

function acquire(): void {
  lockCount += 1;
  if (lockCount > 1) return;

  const body = document.body;
  const root = document.documentElement;
  savedScrollY = window.scrollY;
  saved = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    rootOverflow: root.style.overflow,
  };

  body.style.position = 'fixed';
  body.style.top = `-${savedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  root.style.overflow = 'hidden';
}

function release(): void {
  // Never below zero: React's development StrictMode mounts effects twice, and
  // a stray extra release would otherwise leave the count negative and the next
  // real lock unable to reach 1.
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0 || !saved) return;

  const body = document.body;
  const root = document.documentElement;
  body.style.position = saved.position;
  body.style.top = saved.top;
  body.style.left = saved.left;
  body.style.right = saved.right;
  body.style.width = saved.width;
  body.style.overflow = saved.overflow;
  root.style.overflow = saved.rootOverflow;
  saved = null;

  window.scrollTo(0, savedScrollY);
}

/**
 * True while any overlay holds the page. `page.tsx` asks before snapping: the
 * lock and unlock each emit a scroll event of their own, and letting the snap
 * act on those would move the page out from under a reader — or leave its idea
 * of the parked section pointing at the wrong one.
 */
export function isBodyScrollLocked(): boolean {
  return lockCount > 0;
}

export default function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    acquire();
    return release;
  }, [locked]);
}
