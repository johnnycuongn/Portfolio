'use client';

/**
 * Zone A — Doing now. Active goals as ruled rows, then the flat working set beneath.
 *
 * Rows, not cards. The timeline above already carries every goal's bar and it is the
 * hero of the page; repeating that hero treatment here gave the dashboard two heroes
 * and therefore none. This half of the page is about what to pick up next, so it is
 * a list: a hairline between rows and nothing else.
 *
 * Sorted worst pace first, so what needs attention floats to the top by itself and
 * there is never a "sort" control to think about.
 *
 * Ticking a task is one click, no confirmation, and an undo toast — the spec's
 * "friction scales with rarity". The optimistic strike-through is the flourish: it
 * rewards the thing you just did and then it is over. No counter goes up, nothing
 * accrues, nothing can be fallen behind on.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';

import { useCareerChrome } from '../PanelLayout/CareerChrome';
import { applyUndo, setTaskStatus } from './mutate';
import type { DoingTaskVM, GoalCardVM } from './derive';
import {
  CompetencyChip,
  EffortTag,
  Empty,
  PaceDot,
  ProgressBar,
  Tally,
  ZoneHeading,
  paceToneClass,
} from './ui';

export default function DoingNow({
  cards,
  tasks,
  note,
  editable,
  goalBase,
}: {
  cards: GoalCardVM[];
  tasks: DoingTaskVM[];
  note: string;
  editable: boolean;
  /** `/career` or `/career/admin` — drill-ins stay inside the tree you are in. */
  goalBase: string;
}) {
  const router = useRouter();
  const chrome = useCareerChrome();
  // `layout` and the fade are inline-transform work, which no stylesheet can undo —
  // so the reduced-motion branch turns the layout projection off and lets the
  // dimming land instantly. The strike-through still reads; it just does not travel.
  const reduceMotion = useReducedMotion() ?? false;
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const tick = useCallback(
    async (task: DoingTaskVM) => {
      if (busy[task.id] || ticked[task.id]) return;
      setBusy((b) => ({ ...b, [task.id]: true }));
      setTicked((t) => ({ ...t, [task.id]: true }));

      const result = await setTaskStatus(task.id, 'done');

      if (!result.ok) {
        setTicked((t) => ({ ...t, [task.id]: false }));
        setBusy((b) => ({ ...b, [task.id]: false }));
        chrome?.notify('That did not save. The task is unchanged.');
        return;
      }

      // The route handed back a real inverse built from the row as it was, so Undo
      // restores the exact dates rather than guessing at them.
      chrome?.notify(`Done — ${task.title}`, () => {
        void (async () => {
          const undone = await applyUndo(result.undo);
          if (!undone) {
            chrome?.notify('Could not undo that.');
            return;
          }
          setTicked((t) => ({ ...t, [task.id]: false }));
          setBusy((b) => ({ ...b, [task.id]: false }));
          router.refresh();
        })();
      });

      // Let the strike-through land before the row leaves the working set.
      setTimeout(() => router.refresh(), 900);
    },
    [busy, chrome, router, ticked],
  );

  return (
    <section className="flex flex-col gap-4">
      <ZoneHeading title="Doing now" aside="sorted by pace, furthest behind first" />

      {cards.length === 0 ? (
        <Empty>No goals are active. Pull one out of the backlog when you have capacity.</Empty>
      ) : (
        <div className="flex flex-col">
          {cards.map((card) => (
            <article
              key={card.id}
              className="flex flex-col gap-3 border-b border-rule py-4 last:border-b-0 lg:flex-row lg:items-center lg:gap-6"
            >
              <div className="flex flex-col gap-1.5 lg:w-[30%] lg:shrink-0">
                <Link
                  href={`${goalBase}/goal/${card.id}`}
                  className="text-[14.5px] font-medium leading-[1.3] text-ink decoration-signal decoration-1 underline-offset-2 hover:underline"
                >
                  {card.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <CompetencyChip name={card.horizon} />
                  <span className="text-[11px] text-ink-muted">{card.competency}</span>
                </div>
              </div>

              <div className="flex flex-grow flex-col gap-2">
                <ProgressBar
                  pct={card.pct}
                  elapsedPct={card.elapsedPct}
                  pastTarget={card.pastTarget}
                  label={`${card.title} progress`}
                />
                <div className="text-[11.5px] text-ink-muted">
                  {card.nextTask ? `Next up: ${card.nextTask}` : 'Nothing left on this one'}
                </div>
              </div>

              <div className="flex items-end justify-between gap-4 lg:w-[230px] lg:shrink-0 lg:justify-end">
                <div className="flex flex-col items-start gap-0.5 lg:items-end">
                  <Tally done={card.doneCount} of={`of ${card.totalCount} tasks`} />
                  <span className="type-condensed text-[11px] text-ink-muted">
                    {card.milestoneLabel}
                  </span>
                </div>

                {/* No horizon, no pace, no dot, no colour. Deliberately blank. */}
                {card.paceLabel ? (
                  <div className="flex shrink-0 items-center gap-2 lg:w-[74px] lg:justify-end">
                    <PaceDot band={card.paceBand} pastTarget={card.pastTarget} />
                    <span
                      className={`type-condensed text-[13px] ${paceToneClass(card.paceBand, card.pastTarget)}`}
                      title="Progress minus the share of the horizon already elapsed"
                    >
                      {card.paceLabel}
                    </span>
                  </div>
                ) : (
                  <span className="shrink-0 text-[11px] text-ink-muted lg:w-[74px] lg:text-right">
                    no horizon
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/*
        The working set. Inset rather than raised: it is the same zone, one level
        further in, and an inset reads as "inside this" where a second white card
        would read as "another thing".
      */}
      <div className="rounded-lg bg-surface-2 px-3.5 py-1 sm:px-4">
        <div className="flex items-center justify-between gap-4 border-b border-rule py-2.5">
          <span className="text-[12.5px] font-medium text-ink">In flight</span>
          <span className="text-[11.5px] text-ink-muted">{note}</span>
        </div>

        {tasks.length === 0 ? (
          <div className="py-4 text-[12.5px] text-ink-muted">
            Nothing started. Pick something up from Up next.
          </div>
        ) : (
          tasks.map((task) => {
            const done = ticked[task.id] === true;
            return (
              <motion.div
                key={task.id}
                layout={!reduceMotion}
                animate={done ? { opacity: 0.55 } : { opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.25 }}
                className="flex items-center gap-2 border-b border-rule py-1.5 last:border-b-0 sm:gap-3"
              >
                {editable ? (
                  <button
                    type="button"
                    onClick={() => void tick(task)}
                    aria-label={`Mark "${task.title}" done`}
                    disabled={done}
                    // 44px of hit area around an 18px box, pulled back into the row
                    // so the list stays dense without the target shrinking with it.
                    className="-my-1.5 -ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center"
                  >
                    <span
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border-[1.5px] transition-colors ${
                        done
                          ? 'border-signal bg-signal text-ink-on-signal'
                          : 'border-rule-strong bg-surface'
                      }`}
                    >
                      {done ? (
                        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                          <path
                            d="M3.5 8.5l3 3L12.5 5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                  </button>
                ) : (
                  <span
                    aria-hidden
                    className="h-[18px] w-[18px] shrink-0 rounded-[4px] border-[1.5px] border-rule-strong"
                  />
                )}

                <span
                  className={`min-w-0 flex-shrink text-[13.5px] ${
                    done ? 'text-ink-muted line-through' : 'text-ink'
                  }`}
                >
                  {task.title}
                </span>

                <span className="hidden truncate text-[11px] text-ink-muted sm:inline">
                  {task.goalTitle}
                </span>

                <span className="flex-grow" />
                <EffortTag effort={task.effort} />
                <span
                  // 21 days in Doing is the honest signal a goal has stalled. A
                  // marker, not an alarm: it states the age in a firmer colour and
                  // stops there. Nothing here is overdue — no date has passed.
                  className={`type-condensed w-[76px] shrink-0 text-right text-[11px] sm:w-[86px] ${
                    task.stale ? 'text-ink' : 'text-ink-muted'
                  }`}
                >
                  {done ? 'done' : task.age}
                </span>
              </motion.div>
            );
          })
        )}
      </div>
    </section>
  );
}
