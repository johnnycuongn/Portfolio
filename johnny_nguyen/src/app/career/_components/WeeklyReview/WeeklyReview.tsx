'use client';

/**
 * The weekly review — an invitation on the dashboard, not an alert.
 *
 * Once a week this card is there. It shows what moved, anything that has been
 * sitting in Doing for over three weeks, and asks one question: *what did you
 * finish that is not in here yet?* That question is the entire reason the card
 * exists — most unplanned wins are lost because nobody asked at the right moment,
 * and a win logged a week late is still a win logged.
 *
 * What it must never become, and what the code below is arranged to prevent:
 *
 *   - **No notification, no badge, no red dot.** There is no unread state and
 *     nothing renders in the nav. The card is either on the page or it is not.
 *   - **Dismissing costs nothing.** "Not now" writes a week key to localStorage
 *     and the card goes. No confirmation, no "are you sure", no reschedule, and
 *     nothing is recorded as skipped.
 *   - **No catch-up.** Away for three weeks and the card looks identical to the
 *     one you would have seen after three days. See `shouldOpenWeeklyReview`.
 *   - **Nothing is coloured for being late.** The stalled list is muted grey and
 *     its copy offers dropping the task as a perfectly good answer, because a
 *     task stuck for a month usually means the goal changed, not that you failed.
 *
 * Dismissal lives in localStorage on purpose: it is throwaway view state, and the
 * spec reserves the database for things worth carrying between devices. Being
 * asked the question once per device per week is a much smaller cost than a
 * settings write on every dismissal.
 *
 * Presentation carries the same argument. The card is an inset tray on the ground —
 * a drawer that has slid open — rather than a raised, ruled panel: raised is what
 * Recently completed is, and the one thing an invitation must not do is outrank the
 * record of what you have finished. Nothing in here is coloured except the small
 * square beside a completed entry, which is the accent doing its only job.
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { COMPETENCY_SEED, type CompetencyId, type IsoDate } from '@/lib/career/types';
import WinForm, { type SavedWin } from '../Achievements/WinForm';
import {
  buildWeeklyDigest,
  dayLabel,
  shouldOpenWeeklyReview,
  weekKey,
  STALLED_DAYS,
  type ReviewGoal,
  type ReviewMilestone,
  type ReviewTask,
  type ReviewWin,
  type WeeklyDigest,
} from './digest';

export const WEEKLY_REVIEW_STORAGE_KEY = 'career/weekly-review/dismissed';

/* --------------------------------------------------------------------- pieces */

/**
 * The breakdown under the readout, as discrete figures rather than a string.
 *
 * `movedSummary` in digest.ts joins its parts with middle dots, which is the
 * commonest generated-page tell there is; the same three counts laid out with
 * space between them say the same thing and read as an instrument.
 */
function movedParts(digest: WeeklyDigest): Array<{ n: number; label: string }> {
  const parts: Array<{ n: number; label: string }> = [];
  const { milestones, wins, tasks } = digest;
  if (milestones.length > 0) {
    parts.push({ n: milestones.length, label: milestones.length === 1 ? 'milestone' : 'milestones' });
  }
  if (wins.length > 0) parts.push({ n: wins.length, label: wins.length === 1 ? 'win' : 'wins' });
  if (tasks.length > 0) {
    parts.push({ n: tasks.length, label: tasks.length === 1 ? 'task ticked' : 'tasks ticked' });
  }
  return parts;
}

/* ----------------------------------------------------------------- component */

export type WeeklyReviewProps = {
  /** The review asks you to add something, so the read-only tree renders nothing. */
  editable: boolean;
  /** The server's today. Never recomputed in the browser. */
  today: IsoDate;
  goals: readonly ReviewGoal[];
  milestones: readonly ReviewMilestone[];
  tasks: readonly ReviewTask[];
  wins: readonly ReviewWin[];
  competencies?: ReadonlyArray<{ id: string; name: string }>;
  /** The achievements screen can pass the thinnest competency. */
  defaultCompetencyId?: CompetencyId;
  /** Overridable so a second instance cannot fight over the same key. */
  storageKey?: string;
  className?: string;
};

export default function WeeklyReview({
  editable,
  today,
  goals,
  milestones,
  tasks,
  wins,
  competencies = COMPETENCY_SEED,
  defaultCompetencyId,
  storageKey = WEEKLY_REVIEW_STORAGE_KEY,
  className,
}: WeeklyReviewProps) {
  const reduced = useReducedMotion();

  // Starts closed and opens after mount. localStorage is not available while the
  // server renders, and guessing would mean a hydration mismatch on the one card
  // whose whole job is to be unobtrusive.
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState<SavedWin[]>([]);

  useEffect(() => {
    let dismissed: string | null = null;
    try {
      dismissed = window.localStorage.getItem(storageKey);
    } catch {
      // Private browsing, blocked storage. Showing the card is the safe failure:
      // an extra invitation is cheaper than never asking.
    }
    setOpen(shouldOpenWeeklyReview(dismissed, today));
  }, [storageKey, today]);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(storageKey, weekKey(today));
    } catch {
      // It reappears on the next page load. Harmless, and not worth telling
      // anyone about — this card is never allowed to raise an error.
    }
  }, [storageKey, today]);

  if (!editable) return null;

  const digest = buildWeeklyDigest({ goals, milestones, tasks, wins, today });
  const parts = movedParts(digest);
  const highlights = [...digest.milestones, ...digest.wins].slice(0, 3);
  const stalled = digest.stalled.slice(0, 3);

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.section
          key="weekly-review"
          initial={reduced ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
          className={`box-border rounded-xl bg-surface-2 px-4 py-5 sm:px-6 ${className ?? ''}`}
          aria-label="Weekly review"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="type-display m-0 text-[19px] text-ink sm:text-[21px]">This week</h2>
            <span className="type-condensed text-[12px] text-ink-faint">
              {dayLabel(digest.since)} to {dayLabel(digest.today)}
            </span>
          </div>

          {/* ---------------------------------------------------- what moved */}
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className="flex items-baseline gap-2">
                <span className="type-readout text-[34px] text-ink">{digest.movedCount}</span>
                <span className="text-[12.5px] text-ink-muted">
                  {digest.movedCount === 1 ? 'thing moved' : 'things moved'}
                </span>
              </span>
              {parts.map((part) => (
                <span key={part.label} className="type-condensed text-[12.5px] text-ink-muted">
                  <span className="text-ink">{part.n}</span> {part.label}
                </span>
              ))}
            </div>

            {highlights.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {highlights.map((entry) => (
                  <li
                    key={`${entry.kind}-${entry.id}`}
                    className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5"
                  >
                    {/* The accent's only appearance in here: a mark on a thing that
                        is finished. It is a square, not the date's colour, because
                        the accent is not a 4.5:1 text colour in every theme. */}
                    <span
                      className="mt-[1px] h-[7px] w-[7px] shrink-0 self-center rounded-[1px] bg-signal"
                      aria-hidden
                    />
                    <span className="type-condensed w-[48px] shrink-0 text-[11.5px] text-ink-faint">
                      {dayLabel(entry.date)}
                    </span>
                    <span className="min-w-0 text-[13.5px] leading-[1.4] text-ink">
                      {entry.title}
                    </span>
                    {entry.goalTitle ? (
                      <span className="type-condensed text-[12px] text-ink-faint">
                        {entry.goalTitle}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 max-w-[62ch] text-[13px] leading-[1.5] text-ink-muted">
                A quiet week. That is all it is — the question below is worth answering anyway.
              </p>
            )}
          </div>

          {/* ------------------------------------------------ sitting in Doing */}
          {stalled.length > 0 ? (
            <div className="mt-5 border-t border-rule pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="type-display text-[14px] text-ink">Sitting in Doing</span>
                <span className="type-condensed text-[12px] text-ink-faint">
                  over {STALLED_DAYS} days
                </span>
              </div>
              <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
                {stalled.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="type-condensed w-[48px] shrink-0 text-[11.5px] text-ink-faint">
                      {task.days}d
                    </span>
                    <span className="min-w-0 text-[13.5px] leading-[1.4] text-ink-muted">
                      {task.title}
                    </span>
                    {task.goalTitle ? (
                      <span className="type-condensed text-[12px] text-ink-faint">
                        {task.goalTitle}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-3 max-w-[62ch] text-[12.5px] leading-[1.5] text-ink-faint">
                Moving one of these back to To do — or dropping the goal it belongs to — is a
                perfectly good answer. A task stuck for a month usually means the plan changed.
              </p>
            </div>
          ) : null}

          {/* ------------------------------------------------- the one question */}
          <div className="mt-5 border-t border-rule pt-4">
            <WinForm
              editable
              variant="bare"
              startOpen
              today={today}
              competencies={competencies}
              defaultCompetencyId={defaultCompetencyId}
              prompt="What did you finish that is not in here yet?"
              onSaved={(win) => setLogged((current) => [...current, win])}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-rule pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <span
              className="max-w-[62ch] text-[12px] leading-[1.45] text-ink-faint"
              aria-live="polite"
            >
              {logged.length > 0
                ? `${logged.length} ${logged.length === 1 ? 'win' : 'wins'} added from this review.`
                : 'This asks once a week. Skipping it costs nothing and leaves no trace.'}
            </span>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex min-h-[44px] shrink-0 items-center self-start px-1 text-[13px] text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline sm:min-h-[40px] sm:self-auto"
            >
              Not now
            </button>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
