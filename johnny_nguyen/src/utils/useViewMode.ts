'use client'

import { useCallback, useEffect, useState } from 'react';

export type ViewMode = 'line' | 'rail';

const STORAGE_KEY = 'experience-view-mode';

/**
 * The Experience section's view mode, persisted across visits.
 *
 * Always starts at 'line' — on the server and on the client's first paint —
 * so the markup React hydrates matches what the server sent. A stored
 * preference is applied one frame later from the effect. A returning visitor
 * therefore sees line mode for a single frame before their choice takes
 * effect; that is the deliberate cost of not risking a hydration mismatch.
 */
const useViewMode = () => {
  const [mode, setMode] = useState<ViewMode>('line');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'line' || stored === 'rail') setMode(stored);
  }, []);

  // Persisting here rather than in an effect on `mode` means the only thing
  // that ever writes storage is a deliberate user action. An effect would run
  // once on mount too, with `mode` still at the default, and could overwrite a
  // stored preference before the read effect above had applied it.
  const toggle = useCallback(() => {
    setMode((current) => {
      const next: ViewMode = current === 'line' ? 'rail' : 'line';
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { mode, toggle };
};

export default useViewMode;
