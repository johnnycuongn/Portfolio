/**
 * Activity heatmap — the day index and the intensity buckets, in pure functions.
 *
 * The rule the whole grid rests on, from the spec: shading comes from tasks
 * completed that day, in five buckets, and a milestone reached counts as three
 * tasks because reaching one is a bigger day than ticking a box.
 *
 * And the rule it must never break: an empty day is an empty cell. Never red,
 * never marked as a miss, and — the spec is explicit — never counted towards a
 * streak. There is no streak here, no longest-run figure, nothing that turns the
 * record of what happened into a balance you can fall behind on.
 */

import { monthAbbr, startOfUtcDay, toIsoDate } from '@/lib/career/horizon';
import type { IsoDate } from '@/lib/career/types';

const DAY_MS = 86_400_000;

/** UTC-midnight day arithmetic, the same policy as `@/lib/career/horizon`. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** A milestone reached shades a day as hard as three tasks. */
export const MILESTONE_WEIGHT = 3;

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** Empty · 1 · 2–3 · 4–5 · 6+. */
export function levelForScore(score: number): HeatLevel {
  if (score <= 0) return 0;
  if (score <= 1) return 1;
  if (score <= 3) return 2;
  if (score <= 5) return 3;
  return 4;
}

/**
 * The five buckets, as theme tokens rather than fixed colours: each ramp runs from
 * the active theme's neutral up to its one signal colour, so the grid re-inks
 * itself when the theme changes instead of staying pinned to one palette.
 *
 * Index 0 is the neutral empty cell — a day with nothing on it, not a warning and
 * not a miss. No theme defines it as red, and nothing here would let it become one.
 */
export const LEVEL_COLOURS: Record<HeatLevel, string> = {
  0: 'var(--heat-0)',
  1: 'var(--heat-1)',
  2: 'var(--heat-2)',
  3: 'var(--heat-3)',
  4: 'var(--heat-4)',
};

/* ------------------------------------------------------------------- inputs */

export type HeatTask = {
  id: string;
  title: string;
  goalId: string;
  completedAt: IsoDate | null;
  status: string;
};

export type HeatMilestone = {
  id: string;
  title: string;
  goalId: string;
  status: string;
  completedAt: IsoDate | null;
  targetDate: IsoDate | null;
};

export type HeatWin = {
  id: string;
  title: string;
  happenedOn: IsoDate;
};

export type HeatGoal = {
  id: string;
  title: string;
  status: string;
  closedOn: IsoDate | null;
  /** Computed by the caller with `targetDate(goal)` — this module stays date-only. */
  targetDate: IsoDate | null;
};

/* -------------------------------------------------------------------- index */

export type DayEntry = {
  kind: 'task' | 'milestone' | 'win';
  id: string;
  title: string;
  goalId: string | null;
};

export type DayActivity = {
  iso: IsoDate;
  tasks: number;
  milestones: number;
  wins: number;
  /** tasks + 3 × milestones. Wins are listed on hover but never shade a cell. */
  score: number;
  level: HeatLevel;
  entries: DayEntry[];
};

export type DayIndex = ReadonlyMap<IsoDate, DayActivity>;

function touch(map: Map<IsoDate, DayActivity>, iso: IsoDate): DayActivity {
  const existing = map.get(iso);
  if (existing) return existing;
  const created: DayActivity = {
    iso,
    tasks: 0,
    milestones: 0,
    wins: 0,
    score: 0,
    level: 0,
    entries: [],
  };
  map.set(iso, created);
  return created;
}

/**
 * One pass over the three arrays, producing everything a cell needs: its shade
 * and the list of things that happened, which is what the hover card shows.
 */
export function buildDayIndex(
  tasks: readonly HeatTask[],
  milestones: readonly HeatMilestone[],
  wins: readonly HeatWin[] = [],
): DayIndex {
  const map = new Map<IsoDate, DayActivity>();

  for (const task of tasks) {
    if (task.status !== 'done' || !task.completedAt) continue;
    const day = touch(map, task.completedAt);
    day.tasks += 1;
    day.entries.push({ kind: 'task', id: task.id, title: task.title, goalId: task.goalId });
  }

  for (const milestone of milestones) {
    if (milestone.status !== 'done' || !milestone.completedAt) continue;
    const day = touch(map, milestone.completedAt);
    day.milestones += 1;
    day.entries.push({
      kind: 'milestone',
      id: milestone.id,
      title: milestone.title,
      goalId: milestone.goalId,
    });
  }

  for (const win of wins) {
    if (!win.happenedOn) continue;
    const day = touch(map, win.happenedOn);
    day.wins += 1;
    day.entries.push({ kind: 'win', id: win.id, title: win.title, goalId: null });
  }

  for (const day of map.values()) {
    day.score = day.tasks + day.milestones * MILESTONE_WEIGHT;
    day.level = levelForScore(day.score);
    // Milestones first: on a day that carried one, it is the thing worth reading.
    day.entries.sort((a, b) => rankEntry(a) - rankEntry(b) || a.title.localeCompare(b.title));
  }

  return map;
}

function rankEntry(entry: DayEntry): number {
  return entry.kind === 'milestone' ? 0 : entry.kind === 'win' ? 1 : 2;
}

/* ------------------------------------------------------------------- overlay */

export type OverlayKey = 'milestones' | 'deadlines' | 'completed';

export type OverlayIndex = {
  /** Future days carrying a milestone target date. */
  milestones: ReadonlyMap<IsoDate, string[]>;
  /** Future days carrying a goal's computed target date. */
  deadlines: ReadonlyMap<IsoDate, string[]>;
  /** Past days on which a goal was finished. */
  completed: ReadonlyMap<IsoDate, string[]>;
};

function pushTo(map: Map<IsoDate, string[]>, iso: IsoDate, label: string): void {
  const list = map.get(iso);
  if (list) list.push(label);
  else map.set(iso, [label]);
}

export function buildOverlayIndex(
  goals: readonly HeatGoal[],
  milestones: readonly HeatMilestone[],
): OverlayIndex {
  const upcoming = new Map<IsoDate, string[]>();
  const deadlines = new Map<IsoDate, string[]>();
  const completed = new Map<IsoDate, string[]>();

  for (const milestone of milestones) {
    if (milestone.status === 'done' || !milestone.targetDate) continue;
    pushTo(upcoming, milestone.targetDate, milestone.title);
  }

  for (const goal of goals) {
    if (goal.targetDate && goal.status !== 'done' && goal.status !== 'dropped') {
      pushTo(deadlines, goal.targetDate, goal.title);
    }
    if (goal.status === 'done' && goal.closedOn) {
      pushTo(completed, goal.closedOn, goal.title);
    }
  }

  return { milestones: upcoming, deadlines, completed };
}

/* --------------------------------------------------------------------- grid */

export type HeatCell = {
  iso: IsoDate;
  date: Date;
  /** Weekday 0–6, Monday first. */
  weekday: number;
  future: boolean;
  activity: DayActivity | null;
};

export type HeatWeek = {
  key: string;
  /** The Monday of the column, used for the month label above it. */
  start: Date;
  /** `Sep`, only on the first column of a month; empty otherwise. */
  monthLabel: string;
  cells: HeatCell[];
};

/** The Monday on or before a date. */
export function mondayOf(date: Date): Date {
  const day = startOfUtcDay(date);
  // getUTCDay: 0 = Sunday. Monday-first means Sunday is 6 days into the week.
  const offset = (day.getUTCDay() + 6) % 7;
  return addDays(day, -offset);
}

/** The Sunday on or after a date. */
export function sundayOf(date: Date): Date {
  return addDays(mondayOf(date), 6);
}

/** Last day of the quarter a date falls in — how far forward the overlays reach. */
export function endOfQuarter(date: Date): Date {
  const day = startOfUtcDay(date);
  const lastMonth = Math.floor(day.getUTCMonth() / 3) * 3 + 3; // 1-based
  return new Date(Date.UTC(day.getUTCFullYear(), lastMonth, 0));
}

export type BuildWeeksOptions = {
  /** Columns of history to draw. 53 covers a rolling twelve months. */
  weeks?: number;
  /** With any overlay on, the grid runs to the end of the current quarter. */
  extendToQuarterEnd?: boolean;
};

/**
 * Columns of seven days, Monday at the top, the most recent week on the right.
 * Future days are kept as cells rather than blanks so the overlays have somewhere
 * to land — they are drawn greyed, so past and future never read the same.
 */
export function buildWeeks(
  today: Date,
  index: DayIndex,
  options: BuildWeeksOptions = {},
): HeatWeek[] {
  const columns = Math.max(1, options.weeks ?? 53);
  const day = startOfUtcDay(today);
  const lastMonday = mondayOf(day);
  const firstMonday = addDays(lastMonday, -(columns - 1) * 7);

  let end = sundayOf(day);
  if (options.extendToQuarterEnd) {
    const quarterEnd = sundayOf(endOfQuarter(day));
    if (quarterEnd.getTime() > end.getTime()) end = quarterEnd;
  }

  const weeks: HeatWeek[] = [];
  let previousMonth = -1;

  for (let cursor = firstMonday; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 7)) {
    const cells: HeatCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = addDays(cursor, weekday);
      const iso = toIsoDate(date);
      cells.push({
        iso,
        date,
        weekday,
        future: date.getTime() > day.getTime(),
        activity: index.get(iso) ?? null,
      });
    }

    const month = cursor.getUTCMonth();
    // A label goes on the first column that lands in a new month — the same rule
    // GitHub uses, and it keeps labels aligned when narrow screens drop columns.
    const label = month !== previousMonth ? monthAbbr(month + 1) : '';
    previousMonth = month;

    weeks.push({ key: toIsoDate(cursor), start: cursor, monthLabel: label, cells });
  }

  return weeks;
}

/**
 * Index of the column that today falls in, or the last column if today is somehow
 * outside the drawn range.
 *
 * It exists so the narrow layout can keep "the last 13 weeks" meaning thirteen
 * weeks of *history* even when an overlay has extended the grid forward into the
 * quarter. Counting back from the end of the array instead would quietly hide real
 * days the moment a toggle was flipped.
 */
export function weekIndexOfToday(weeks: readonly HeatWeek[], today: Date): number {
  const monday = mondayOf(today).getTime();
  for (let i = 0; i < weeks.length; i += 1) {
    if (weeks[i].start.getTime() === monday) return i;
  }
  return Math.max(0, weeks.length - 1);
}

/** Total tasks and milestones in the drawn range — the honest, always-rising line. */
export function totalCompleted(weeks: readonly HeatWeek[]): number {
  let total = 0;
  for (const week of weeks) {
    for (const cell of week.cells) {
      if (!cell.activity) continue;
      total += cell.activity.tasks + cell.activity.milestones;
    }
  }
  return total;
}

/** `Wed 18 Sep 2026` — the hover card's heading. */
export function longDayLabel(date: Date): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${names[date.getUTCDay()]} ${date.getUTCDate()} ${monthAbbr(
    date.getUTCMonth() + 1,
  )} ${date.getUTCFullYear()}`;
}
