'use client';

/**
 * The little bit of shared client state every career screen needs: whether the
 * dashboard is in edit-layout mode, and the undo toast.
 *
 * It is a context rather than props because the two ends are far apart — the toggle
 * lives in the top bar and the thing it toggles lives several panels down — and
 * because a screen that has no panels (the master table, achievements) should be
 * able to render the top bar without knowing any of this exists. `useCareerChrome`
 * returns null outside the provider, and every consumer treats that as "not here".
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';

type Toast = { id: number; text: string; onUndo?: () => void };

type Chrome = {
  /** True only inside the admin tree AND with a valid session. */
  editable: boolean;
  editMode: boolean;
  setEditMode: (value: boolean) => void;
  /**
   * A flourish, never an obligation. Says what you just did and offers to take it
   * back; it disappears on its own and leaves nothing behind.
   */
  notify: (text: string, onUndo?: () => void) => void;
};

const ChromeContext = createContext<Chrome | null>(null);

export function useCareerChrome(): Chrome | null {
  return useContext(ChromeContext);
}

/** Toasts last long enough to read and to undo, and not a second longer. */
const TOAST_MS = 6000;

export default function CareerChrome({
  isAdmin,
  children,
}: {
  /** A valid admin session exists. Says nothing about which tree is being viewed. */
  isAdmin: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const reduceMotion = useReducedMotion() ?? false;
  // Editing is the admin *tree* plus a session. Visiting /career with a valid
  // cookie is still the read-only view, deliberately: the public page is the one
  // you screen-share, and it should look the same whoever is holding the laptop.
  const editable = isAdmin && pathname.startsWith('/career/admin');

  const [editMode, setEditModeState] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Leaving the admin tree must not leave edit mode armed behind you.
  useEffect(() => {
    if (!editable && editMode) setEditModeState(false);
  }, [editable, editMode]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const notify = useCallback((text: string, onUndo?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    const id = (nextId.current += 1);
    setToast({ id, text, onUndo });
    timer.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, TOAST_MS);
  }, []);

  const setEditMode = useCallback(
    (value: boolean) => setEditModeState(value && editable),
    [editable],
  );

  const value = useMemo<Chrome>(
    () => ({ editable, editMode, setEditMode, notify }),
    [editable, editMode, setEditMode, notify],
  );

  return (
    <ChromeContext.Provider value={value}>
      {children}

      {/*
        The toast rail. Positioning lives on this static wrapper and the motion only
        ever touches the bar inside it, because motion writes `transform` inline and
        would otherwise wipe out a Tailwind `-translate-x-1/2` used for centring.

        Bottom-anchored so it is inside thumb reach on a phone, lifted clear of the
        home indicator by the safe-area inset, and lifted again while the edit-layout
        tray is up so the two never stack on top of each other. The rail itself is
        pointer-transparent: only the bar takes clicks, so nothing underneath the
        rest of the row becomes unreachable while a toast is on screen.
      */}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3 sm:px-6"
        style={{
          bottom: `calc(env(safe-area-inset-bottom, 0px) + ${editMode ? '8.5rem' : '1rem'})`,
        }}
      >
        <AnimatePresence>
          {toast ? (
            <motion.div
              key={toast.id}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
              role="status"
              aria-live="polite"
              className="pointer-events-auto flex w-full items-center gap-3 rounded-lg border border-ink-faint bg-ink py-2 pl-4 pr-2 text-ground shadow-[0_8px_28px_rgba(0,0,0,0.22)] sm:w-auto sm:max-w-[min(34rem,100%)]"
            >
              <span className="min-w-0 flex-1 text-[13px] leading-snug sm:flex-none">
                {toast.text}
              </span>

              {toast.onUndo ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.onUndo?.();
                    setToast(null);
                  }}
                  className="flex h-11 shrink-0 items-center rounded-md border border-ink-faint px-3 text-[13px] font-medium transition-colors hover:bg-ink-muted sm:h-9"
                >
                  Undo
                </button>
              ) : null}

              {/* An explicit dismiss, so whatever the toast is sitting over can be
                  reached again without waiting out the timer. */}
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Dismiss"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-ink-muted sm:h-9 sm:w-9"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </ChromeContext.Provider>
  );
}
