'use client';

/**
 * Zone D — Backlog. Collapsed by default to a single line.
 *
 * Framed as a menu of options rather than a queue. No ages, no "sitting here eight
 * months", no overdue styling, no colour: nothing in the backlog is late, by
 * definition, and the moment it starts looking late it becomes the reason you stop
 * opening the dashboard.
 *
 * Sorted by hours ascending, which answers the one question it exists to answer —
 * "I have a free weekend, what can I actually finish." Each row has exactly one
 * action: move to Active.
 *
 * The open/closed state is browser storage, not the database. It is throwaway view
 * state and genuinely per-device; the panel *arrangement* is the thing that follows
 * you between machines, and that lives in Postgres.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { useCareerChrome } from '../PanelLayout/CareerChrome';
import { applyUndo, setGoalStatus } from './mutate';
import type { BacklogVM } from './derive';
import { ZoneHeading } from './ui';

const OPEN_KEY = 'career:backlog-open';

export default function Backlog({
  backlog,
  editable,
  goalBase,
}: {
  backlog: BacklogVM;
  editable: boolean;
  goalBase: string;
}) {
  const router = useRouter();
  const chrome = useCareerChrome();
  // The height animation writes inline styles, so the CSS-level motion override
  // cannot cancel it. Collapse the duration to zero instead: the panel still opens
  // and closes, it just arrives already there.
  const reduceMotion = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Read after mount, never during render: localStorage does not exist on the
  // server, and a value read during render is a hydration mismatch.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(OPEN_KEY) === '1') setOpen(true);
    } catch {
      // Private mode, blocked site data. Collapsed is a perfectly good default.
    }
  }, []);

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(OPEN_KEY, next ? '1' : '0');
      } catch {
        /* nothing to do, and nothing worth saying */
      }
      return next;
    });
  }, []);

  const activate = useCallback(
    async (id: string, title: string) => {
      if (busy[id]) return;
      setBusy((b) => ({ ...b, [id]: true }));

      // Entering Active is what sets started_on — the spec's "set when it first
      // enters Active" — and the route is what stamps it.
      const result = await setGoalStatus(id, 'active');
      if (!result.ok) {
        setBusy((b) => ({ ...b, [id]: false }));
        chrome?.notify('That did not save. The goal is still in the backlog.');
        return;
      }
      chrome?.notify(`Active — ${title}`, () => {
        void (async () => {
          await applyUndo(result.undo);
          setBusy((b) => ({ ...b, [id]: false }));
          router.refresh();
        })();
      });
      router.refresh();
    },
    [busy, chrome, router],
  );

  return (
    <section className="flex h-full flex-col gap-1">
      <ZoneHeading title="Backlog" quiet />

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-4 py-2 text-left"
      >
        <span className="text-[13.5px] text-ink">{backlog.summaryLine}</span>
        <span className="shrink-0 text-[12px] text-ink-muted">{open ? 'Hide' : 'Show'}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && backlog.rows.length > 0 ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: [0.2, 0.7, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col">
              <div className="flex items-baseline border-b border-rule-strong pb-1.5 text-[11px] text-ink-muted">
                <span className="flex-grow">Sorted by hours, shortest first</span>
                <span className="w-[52px] text-right">Hours</span>
                <span className="hidden w-[64px] text-right sm:block">Cost</span>
                {editable ? <span className="w-[88px] sm:w-[76px]" /> : null}
              </div>

              {backlog.rows.map((row) => (
                <div key={row.id} className="flex items-center border-b border-rule py-1.5">
                  <div className="flex min-w-0 flex-grow flex-col gap-0.5 pr-2.5">
                    <Link
                      href={`${goalBase}/goal/${row.id}`}
                      className="truncate text-[13px] text-ink decoration-signal decoration-1 underline-offset-2 hover:underline"
                    >
                      {row.title}
                    </Link>
                    <span className="truncate text-[10.5px] text-ink-muted">
                      {row.competency}
                      {row.kind ? `, ${row.kind}` : ''}
                    </span>
                  </div>
                  <span className="type-condensed w-[52px] shrink-0 text-right text-[12px] text-ink-muted">
                    {row.hoursLabel}
                  </span>
                  <span className="type-condensed hidden w-[64px] shrink-0 text-right text-[12px] text-ink-muted sm:block">
                    {row.costLabel}
                  </span>
                  {editable ? (
                    <span className="flex w-[88px] shrink-0 justify-end sm:w-[76px]">
                      <button
                        type="button"
                        onClick={() => void activate(row.id, row.title)}
                        disabled={busy[row.id]}
                        className="h-11 rounded-md border border-rule bg-surface px-3 text-[12px] text-ink transition-colors hover:bg-surface-2 disabled:opacity-50 sm:h-7 sm:px-2.5 sm:text-[11.5px]"
                      >
                        Activate
                      </button>
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
