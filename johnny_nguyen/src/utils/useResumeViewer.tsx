'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface ResumeViewerState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const ResumeViewerContext = createContext<ResumeViewerState | null>(null);

export function ResumeViewerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);

  return <ResumeViewerContext.Provider value={value}>{children}</ResumeViewerContext.Provider>;
}

/**
 * The nav button and the firefly's resume answer both open the viewer, and they
 * sit in different subtrees, so the open state cannot live in either of them.
 */
export default function useResumeViewer(): ResumeViewerState {
  const context = useContext(ResumeViewerContext);
  if (!context) throw new Error('useResumeViewer must be used inside ResumeViewerProvider');
  return context;
}
