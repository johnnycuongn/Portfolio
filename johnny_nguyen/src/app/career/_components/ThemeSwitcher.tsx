'use client';

/**
 * Theme picker.
 *
 * Deliberately a swatch rather than a label: six themes differ only in colour,
 * so the colour is the honest control. The popover shows names anyway, because
 * a row of coloured dots is unusable to anyone who cannot distinguish them.
 *
 * The button renders a stable placeholder until mounted. The active theme comes
 * from an attribute the bootstrap script sets before paint, which the server
 * cannot know, so rendering it directly would hydrate-mismatch.
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { applyTheme, readStoredTheme, systemTheme, THEMES, type ThemeId } from './theme';

export default function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ThemeId>('graphite');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setTheme(readStoredTheme() ?? systemTheme());
    setMounted(true);
  }, []);

  // Close on outside click and on Escape. Escape returns focus to the button so
  // keyboard users are not dropped at the top of the document.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector('button')?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pick = useCallback((id: ThemeId) => {
    applyTheme(id);
    setTheme(id);
    setOpen(false);
  }, []);

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div ref={rootRef} className="relative">
      {/*
        On a phone this collapses to the swatch alone, which drew a 38x36 pill —
        a target you miss. A `min-h`/`min-w` of 44 grows the target without
        touching the padding or the border radius, so the pill becomes a 44px
        circle beside the 44px Quick add button rather than a size of its own,
        and `justify-center` keeps the swatch in the middle of the extra room.
        Once the label appears at `sm` the button is already wider than 44 and
        the min-width does nothing.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={mounted ? `Theme: ${current.name}. Change theme` : 'Change theme'}
        className="flex h-9 min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full border border-rule px-2.5 text-[12px] text-ink-muted transition-colors hover:border-rule-strong hover:text-ink sm:px-3"
      >
        <Swatch meta={current} muted={!mounted} />
        <span className="hidden sm:inline">{mounted ? current.name : 'Theme'}</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            aria-label="Theme"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 z-50 mt-2 w-[232px] overflow-hidden rounded-[10px] border border-rule bg-surface shadow-panel"
          >
            {THEMES.map((meta) => {
              const active = meta.id === theme;
              return (
                <button
                  key={meta.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => pick(meta.id)}
                  className={
                    'flex w-full min-h-[44px] items-center gap-3 px-3 text-left transition-colors ' +
                    (active ? 'bg-signal-soft' : 'hover:bg-surface-2')
                  }
                >
                  <Swatch meta={meta} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{meta.name}</span>
                    <span className="block truncate text-[11px] text-ink-faint">{meta.note}</span>
                  </span>
                  {active ? (
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
                      <path
                        d="M3 8.5l3.2 3.2L13 5"
                        fill="none"
                        stroke="var(--signal)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Ground with the signal laid over it — the two decisions a theme makes. */
function Swatch({ meta, muted = false }: { meta: (typeof THEMES)[number]; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative block h-4 w-4 flex-shrink-0 overflow-hidden rounded-full border border-rule-strong"
      style={{ background: meta.swatch.ground, opacity: muted ? 0.4 : 1 }}
    >
      <span
        className="absolute inset-x-0 bottom-0 block h-1/2"
        style={{ background: meta.swatch.signal }}
      />
      {meta.swatch.signal2 ? (
        <span
          className="absolute bottom-0 right-0 block h-1/2 w-1/2"
          style={{ background: meta.swatch.signal2 }}
        />
      ) : null}
    </span>
  );
}
