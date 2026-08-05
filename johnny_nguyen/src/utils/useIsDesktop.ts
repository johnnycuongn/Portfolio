'use client'

import { useSyncExternalStore } from 'react';

// Matches the `md:` breakpoint the rest of the site steps at, including
// `.rail-card`'s jump from one card in frame to one and a half.
const QUERY = '(min-width: 768px)';

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

const getSnapshot = () => window.matchMedia(QUERY).matches;

/**
 * The server has no viewport, so it has to guess. It reports desktop, which
 * makes the server-rendered markup match the desktop case — the one worth
 * optimising, since Experience is the second of three full-screen acts and a
 * phone visitor has to scroll a whole viewport before it is in view. The
 * one-frame correction to rail mode happens long before they get there.
 */
const getServerSnapshot = () => true;

const useIsDesktop = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export default useIsDesktop;
