'use client';

/**
 * The persistent top bar, shared by all four screens. No sidebars, no nested menus,
 * no settings page worth speaking of — the whole navigation surface is this row.
 *
 * Every screen renders it itself rather than inheriting it from the layout, for one
 * reason: `/career/admin` shows the code gate before it shows anything else, and a
 * gate with a navigation bar above it reads like a half-open door.
 *
 * Links stay inside whichever tree you are in. From `/career/admin` the nav points
 * at the admin twins of each screen, from `/career` at the read-only ones, so you
 * never silently lose your editable session by clicking "Achievements".
 *
 * On a phone the bar is two rows, not one squeezed row: identity and actions above,
 * navigation below at full touch height. Cramming five controls into 390px is how
 * you end up with 28px tap targets and a bar that scrolls sideways.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useCareerChrome } from './PanelLayout/CareerChrome';
import QuickAdd from './QuickAdd/QuickAdd';
import ThemeSwitcher from './ThemeSwitcher';

const NAV = [
  { href: '', label: 'Dashboard', short: 'Dashboard' },
  { href: '/table', label: 'Master table', short: 'Table' },
  { href: '/achievements', label: 'Achievements', short: 'Achievements' },
] as const;

/**
 * A finger needs 44px. Every control in this bar gets it as a `min-height`
 * rather than as a height, which is the difference between a target that is
 * big enough and a bar that has been inflated to make it so: the padding,
 * border and background stay exactly where they were, the box just refuses to
 * measure under 44. The bar itself is still 56px on a phone and 64px on a
 * desktop, so nothing above or below moves.
 *
 * It is unconditional rather than gated behind `pointer: coarse`, because a
 * touchscreen laptop reports a fine pointer and still gets poked with a finger,
 * and because a rule you can only satisfy on some devices is one nobody can
 * check.
 */
const TOUCH = 'min-h-[44px]';

export default function TopBar() {
  const pathname = usePathname() ?? '/career';
  const chrome = useCareerChrome();
  const [quickOpen, setQuickOpen] = useState(false);

  const admin = pathname.startsWith('/career/admin');
  const root = admin ? '/career/admin' : '/career';
  const editable = chrome?.editable ?? false;

  // Goal detail is the fourth screen but never a destination you navigate to cold —
  // it is a drill-in from the dashboard, the table or the log. So it appears in the
  // nav only while you are standing on it, as the place you currently are.
  const onGoal = /\/career(\/admin)?\/goal\//.test(pathname);

  const openQuick = useCallback(() => setQuickOpen(true), []);
  const closeQuick = useCallback(() => setQuickOpen(false), []);

  // One keystroke from anywhere, which is most of what "adding takes under ten
  // seconds" means in practice. Ignored while you are typing in something else.
  useEffect(() => {
    if (!editable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'q' && event.key !== 'Q') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      setQuickOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable]);

  const isActive = (href: string) => {
    const full = `${root}${href}`;
    return href === '' ? pathname === full || pathname === `${full}/` : pathname.startsWith(full);
  };

  // The active item is marked by a rule under it, sitting on the bar's own bottom
  // border. `-mb-px` is what makes the two read as one line rather than two.
  // `min-w-11` (44px) only ever bites on the shortest label — "Table" drew a
  // 31px-wide target on a phone. Centring keeps the added width symmetrical, so
  // the bar looks unchanged while the target clears 44 in both axes.
  const navLink = (active: boolean) =>
    'flex min-w-11 shrink-0 items-center justify-center border-b-2 ' +
    (active
      ? 'border-signal font-medium text-ink'
      : 'border-transparent text-ink-muted transition-colors hover:text-ink');

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-rule bg-ground/95 backdrop-blur-sm">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:h-16 sm:gap-6 sm:px-8 lg:px-10">
          {/*
            `self-stretch` is load-bearing, not tidiness. The row above is
            `items-center`, so without it this group collapses to the height of
            its tallest text and the nav — which asks to stretch — has only 35px
            to stretch into. That is how the active underline ended up floating
            in the middle of a 64px bar instead of sitting on its bottom border,
            and how three navigation links ended up as 36px touch targets.
          */}
          <div className="flex min-w-0 items-center gap-7 self-stretch lg:gap-10">
            <Link
              href={root}
              className={`type-display flex shrink-0 items-center text-[20px] text-ink sm:text-[23px] ${TOUCH}`}
            >
              Ledger
            </Link>

            {/* Desktop navigation. The phone gets its own row below. */}
            <nav
              aria-label="Sections"
              className="hidden min-w-0 items-stretch gap-6 self-stretch text-[14px] sm:flex"
            >
              {NAV.map((item) => (
                <Link
                  key={item.label}
                  href={`${root}${item.href}`}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`${navLink(isActive(item.href))} -mb-px`}
                >
                  {item.label}
                </Link>
              ))}
              {onGoal ? (
                <span aria-current="page" className={`${navLink(true)} -mb-px`}>
                  Goal detail
                </span>
              ) : null}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {editable && chrome ? (
              <button
                type="button"
                onClick={() => chrome.setEditMode(!chrome.editMode)}
                aria-pressed={chrome.editMode}
                className={`hidden h-9 items-center rounded-md border border-rule bg-surface px-3.5 text-[13px] text-ink transition-colors hover:bg-surface-2 lg:inline-flex ${TOUCH}`}
              >
                {chrome.editMode ? 'Done editing' : 'Edit layout'}
              </button>
            ) : null}

            <ThemeSwitcher />

            {editable ? (
              <>
                {/* Phone: a 44px square with the label carried by aria. */}
                <button
                  type="button"
                  onClick={openQuick}
                  aria-label="Quick add"
                  className="flex h-11 w-11 items-center justify-center rounded-md bg-signal text-ink-on-signal transition-colors hover:bg-signal-hover sm:hidden"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                    <path
                      d="M8 2.5v11M2.5 8h11"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={openQuick}
                  className={`hidden h-9 items-center gap-2.5 rounded-md bg-signal pl-3.5 pr-3 text-[13px] font-medium text-ink-on-signal transition-colors hover:bg-signal-hover sm:flex ${TOUCH}`}
                >
                  Quick add
                  <span className="type-condensed rounded-[3px] border border-ink-on-signal/40 px-[5px] py-px text-[11px] opacity-80">
                    Q
                  </span>
                </button>
              </>
            ) : (
              <span className="shrink-0 text-[12px] text-ink-muted">Read-only</span>
            )}
          </div>
        </div>

        {/* Phone navigation: full-height targets, short labels, no overflow at 390px. */}
        <nav
          aria-label="Sections"
          className="flex items-stretch gap-5 border-t border-rule px-4 text-[13px] sm:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={`${root}${item.href}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`${navLink(isActive(item.href))} -mb-px min-h-[44px]`}
            >
              {item.short}
            </Link>
          ))}
          {onGoal ? (
            <span aria-current="page" className={`${navLink(true)} -mb-px min-h-[44px]`}>
              Goal
            </span>
          ) : null}
        </nav>
      </header>

      {editable ? <QuickAdd open={quickOpen} onClose={closeQuick} /> : null}
    </>
  );
}
