/**
 * The weekly review's maths. Pure, no React, no database.
 *
 * The review asks one useful question — *what did you finish that is not in here
 * yet?* — and most unplanned wins are lost simply because nobody asked at the
 * right moment. Everything else in this module exists to make that question feel
 * earned rather than nagging.
 *
 * Two rules from the spec are load-bearing here:
 *
 *   1. **No catch-up.** `shouldOpenWeeklyReview` compares one week key against
 *      one week key. Three weeks away and three days away produce exactly the
 *      same screen: there is no backlog of missed reviews, no "you skipped 2",
 *      nothing to work through. That is the whole reason it is safe to leave the
 *      app alone for a month.
 *   2. **Nothing nags.** There is no count of what is owed in here. What moved is
 *      a list of things you did; what is sitting in Doing is a nudge to *drop*
 *      something, not to hurry it.
 *
 * "What moved" is a rolling seven days ending today, not the calendar week so
 * far. Opening the review on a Monday morning and being told you have done
 * nothing this week would be the exact pressure this app exists to avoid.
 */

import { monthAbbr, parseIsoDate, startOfUtcDay, toIsoDate } from '@/lib/career/horizon';
import type { IsoDate } from '@/lib/career/types';

const DAY_MS = 86_400_000;

/** Spec: a task in Doing for more than 21 days is the honest signal of a stall. */
export const STALLED_DAYS = 21;

/** How much of the recent past "what moved" covers. */
export const WINDOW_DAYS = 7;

/* ------------------------------------------------------------------ week keys */

/** Monday of the week containing `date`, at UTC midnight. */
export function startOfWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  // getUTCDay is 0 for Sunday; shift so Monday is 0.
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * DAY_MS);
}

/**
 * The identity of a week, as the ISO date of its Monday. Dismissal stores one of
 * these, so dismissing is idempotent and expires by itself next Monday.
 */
export function weekKey(today: Date | IsoDate): string {
  const anchor = typeof today === 'string' ? (parseIsoDate(today) ?? new Date()) : today;
  return toIsoDate(startOfWeek(anchor));
}

/**
 * Whether the invitation is showing.
 *
 * One comparison, deliberately: a missed week leaves no trace, so coming back
 * after a long gap shows the same single card as coming back after a day.
 */
export function shouldOpenWeeklyReview(
  dismissedWeek: string | null | undefined,
  today: Date | IsoDate,
): boolean {
  return (dismissedWeek ?? '') !== weekKey(today);
}

/* ---------------------------------------------------------------- input rows */

/** A `Goal` row satisfies this. */
export type ReviewGoal = { id: string; title: string };

/** A `Task` row satisfies this. */
export type ReviewTask = {
  id: string;
  title: string;
  goalId: string;
  status: string;
  startedOn: IsoDate | null;
  completedAt: IsoDate | null;
};

/** A `Milestone` row satisfies this. */
export type ReviewMilestone = {
  id: string;
  title: string;
  goalId: string;
  status: string;
  competencyId: string;
  completedAt: IsoDate | null;
};

/** A `Win` row satisfies this. */
export type ReviewWin = {
  id: string;
  title: string;
  happenedOn: IsoDate;
  competencyId: string;
};

/* -------------------------------------------------------------------- output */

export type MovedEntry = {
  id: string;
  kind: 'milestone' | 'win' | 'task';
  title: string;
  /** The goal it belongs to, where there is one. Wins never have one. */
  goalTitle: string | null;
  date: IsoDate;
  competencyId: string | null;
};

export type StalledTask = {
  id: string;
  title: string;
  goalId: string;
  goalTitle: string | null;
  /** Whole days since it entered Doing. Always greater than STALLED_DAYS. */
  days: number;
};

export type WeeklyDigest = {
  /** First day of the rolling window, inclusive. */
  since: IsoDate;
  today: IsoDate;
  week: string;
  /** Milestones reached, then wins logged, then tasks ticked — newest first within each. */
  milestones: MovedEntry[];
  wins: MovedEntry[];
  tasks: MovedEntry[];
  /** Everything above, in one list, for a simple render. */
  moved: MovedEntry[];
  movedCount: number;
  /** In Doing longer than 21 days, longest first. */
  stalled: StalledTask[];
};

function inWindow(date: IsoDate | null, since: IsoDate, today: IsoDate): boolean {
  // Lexicographic comparison is exact on `YYYY-MM-DD` and needs no parsing.
  return Boolean(date) && (date as IsoDate) >= since && (date as IsoDate) <= today;
}

function newestFirst(a: MovedEntry, b: MovedEntry): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

/**
 * What moved in the last seven days, and what has been sitting still for three
 * weeks. One pass over each table; a personal ledger holds hundreds of rows.
 */
export function buildWeeklyDigest(input: {
  goals: readonly ReviewGoal[];
  milestones: readonly ReviewMilestone[];
  tasks: readonly ReviewTask[];
  wins: readonly ReviewWin[];
  today: Date | IsoDate;
}): WeeklyDigest {
  const anchor =
    typeof input.today === 'string'
      ? (parseIsoDate(input.today) ?? new Date())
      : startOfUtcDay(input.today);
  const todayIso = toIsoDate(anchor);
  const since = toIsoDate(new Date(anchor.getTime() - (WINDOW_DAYS - 1) * DAY_MS));

  const goalTitles = new Map(input.goals.map((goal) => [goal.id, goal.title]));

  const milestones: MovedEntry[] = [];
  for (const milestone of input.milestones) {
    if (milestone.status !== 'done') continue;
    if (!inWindow(milestone.completedAt, since, todayIso)) continue;
    milestones.push({
      id: milestone.id,
      kind: 'milestone',
      title: milestone.title,
      goalTitle: goalTitles.get(milestone.goalId) ?? null,
      date: milestone.completedAt as IsoDate,
      competencyId: milestone.competencyId,
    });
  }

  const wins: MovedEntry[] = [];
  for (const win of input.wins) {
    if (!inWindow(win.happenedOn, since, todayIso)) continue;
    wins.push({
      id: win.id,
      kind: 'win',
      title: win.title,
      goalTitle: null,
      date: win.happenedOn,
      competencyId: win.competencyId,
    });
  }

  const tasks: MovedEntry[] = [];
  const stalled: StalledTask[] = [];

  for (const task of input.tasks) {
    if (task.status === 'done' && inWindow(task.completedAt, since, todayIso)) {
      tasks.push({
        id: task.id,
        kind: 'task',
        title: task.title,
        goalTitle: goalTitles.get(task.goalId) ?? null,
        date: task.completedAt as IsoDate,
        competencyId: null,
      });
      continue;
    }

    if (task.status !== 'doing') continue;
    // No start date means no honest age. Guessing one would invent the very
    // number this list is supposed to be trusted for.
    const started = parseIsoDate(task.startedOn);
    if (!started) continue;
    const days = Math.round((anchor.getTime() - started.getTime()) / DAY_MS);
    if (days <= STALLED_DAYS) continue;
    stalled.push({
      id: task.id,
      title: task.title,
      goalId: task.goalId,
      goalTitle: goalTitles.get(task.goalId) ?? null,
      days,
    });
  }

  milestones.sort(newestFirst);
  wins.sort(newestFirst);
  tasks.sort(newestFirst);
  stalled.sort((a, b) => b.days - a.days);

  const moved = [...milestones, ...wins, ...tasks];

  return {
    since,
    today: todayIso,
    week: weekKey(anchor),
    milestones,
    wins,
    tasks,
    moved,
    movedCount: moved.length,
    stalled,
  };
}

/* ----------------------------------------------------------------- formatting */

/** `8 Sep`. Hardcoded month names, like `horizonLabel` — ICU is not stable across runtimes. */
export function dayLabel(iso: IsoDate): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  return `${date.getUTCDate()} ${monthAbbr(date.getUTCMonth() + 1)}`;
}

/** `7 done · 2 milestones · 1 win`, or null when nothing moved. Never a total of what is open. */
export function movedSummary(digest: WeeklyDigest): string | null {
  const parts: string[] = [];
  if (digest.milestones.length > 0) {
    parts.push(
      `${digest.milestones.length} milestone${digest.milestones.length === 1 ? '' : 's'} reached`,
    );
  }
  if (digest.wins.length > 0) {
    parts.push(`${digest.wins.length} win${digest.wins.length === 1 ? '' : 's'} logged`);
  }
  if (digest.tasks.length > 0) {
    parts.push(`${digest.tasks.length} task${digest.tasks.length === 1 ? '' : 's'} ticked`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
