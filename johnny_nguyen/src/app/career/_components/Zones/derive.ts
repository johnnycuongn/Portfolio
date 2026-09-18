/**
 * The four zones and the summary strip, as data.
 *
 * Every function here is pure: rows in, plain serialisable view-models out, with
 * "today" always passed as an argument. That is deliberate — the dashboard page is
 * a server component, so these run once on the server and the client zones receive
 * small objects rather than the whole task table.
 *
 * Two rules from the spec live in this file and are easy to break by accident:
 *
 *   1. **Done is the loud number.** Every count here is a done/total pair. Nothing
 *      computes "remaining", and nothing sums everything open.
 *   2. **A goal with no horizon has no pace.** `paceBand === 'none'` means draw no
 *      dot at all, not a neutral one. Never colour such a goal for being slow.
 */

import {
  daysBetween,
  horizonLabel,
  horizonWindow,
  monthAbbr,
  parseIsoDate,
  quarterOfMonth,
  startOfUtcDay,
} from '@/lib/career/horizon';
import {
  goalSummary,
  percent,
  progressOf,
  type PaceBand,
  type RollupOptions,
} from '@/lib/career/rollup';
import type { CompetencyId, IsoDate } from '@/lib/career/types';
import type { Competency, Goal, Milestone, Task, Win } from '@/lib/db/schema';

/* ------------------------------------------------------------------- palette */

/**
 * The only three colours in the app that mean "how is this going", and the one
 * place they are defined. Green/amber/red, matching the design artboard.
 *
 * There is no colour for `none`. A goal without a horizon is not "neutral amber",
 * it has no opinion at all, and the card draws nothing.
 */
export const PACE_COLOR: Record<Exclude<PaceBand, 'none'>, string> = {
  ahead: 'var(--pace-ahead)',
  'slightly-behind': 'var(--pace-slightly-behind)',
  behind: 'var(--pace-behind)',
};

/** A task in Doing for longer than this is the honest signal that a goal has stalled. */
export const STALE_DAYS = 21;

/* ------------------------------------------------------------------ utilities */

export type Rows = {
  competencies: readonly Competency[];
  goals: readonly Goal[];
  milestones: readonly Milestone[];
  tasks: readonly Task[];
  wins: readonly Win[];
};

function competencyNames(competencies: readonly Competency[]): Map<string, string> {
  return new Map(competencies.map((c) => [c.id, c.name]));
}

/** `16 Sep`, or `16 Sep 2025` once the date is in another year than today's. */
export function shortDate(iso: IsoDate | null, todayIso: IsoDate): string {
  const date = parseIsoDate(iso);
  if (!date) return '';
  const today = parseIsoDate(todayIso);
  const label = `${date.getUTCDate()} ${monthAbbr(date.getUTCMonth() + 1)}`;
  if (today && date.getUTCFullYear() !== today.getUTCFullYear()) {
    return `${label} ${date.getUTCFullYear()}`;
  }
  return label;
}

/** Whole days from `iso` to today, or null when the date is missing or unparseable. */
function daysSince(iso: IsoDate | null, todayIso: IsoDate): number | null {
  const from = parseIsoDate(iso);
  const today = parseIsoDate(todayIso);
  if (!from || !today) return null;
  return daysBetween(from, today);
}

function isoWithin(iso: IsoDate | null, fromIso: IsoDate, toIso: IsoDate): boolean {
  if (!iso) return false;
  const date = parseIsoDate(iso);
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!date || !from || !to) return false;
  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

/** `todayIso` minus n days, as `YYYY-MM-DD`. */
export function isoDaysAgo(todayIso: IsoDate, days: number): IsoDate {
  const today = parseIsoDate(todayIso);
  if (!today) return todayIso;
  const back = new Date(today.getTime() - days * 86_400_000);
  return back.toISOString().slice(0, 10);
}

/* ------------------------------------------------------- Zone A — Doing now */

export type GoalCardVM = {
  id: string;
  title: string;
  /** `Q3 2026`, `Sep 2026`, `to 30 Oct`, `No horizon`. */
  horizon: string;
  competency: string;
  /** 0–100, the bar fill. */
  pct: number;
  /** 0–100, where the pace marker sits, or null when there is no horizon. */
  elapsedPct: number | null;
  doneCount: number;
  totalCount: number;
  /** `3 of 5 milestones`, or `no milestones`. */
  milestoneLabel: string;
  /** The next unfinished task's title, or null when there is nothing left to do. */
  nextTask: string | null;
  paceBand: PaceBand;
  /** `+12` / `−7`, in whole percentage points. Null when there is no horizon. */
  paceLabel: string | null;
  paceColor: string | null;
  pastTarget: boolean;
};

/** The next task to pick up on a goal: anything in Doing first, then the first Todo. */
function nextTaskFor(goalId: string, tasks: readonly Task[]): Task | null {
  const mine = tasks.filter((t) => t.goalId === goalId);
  return mine.find((t) => t.status === 'doing') ?? mine.find((t) => t.status === 'todo') ?? null;
}

/**
 * Active goals as cards, sorted worst pace first so what needs attention floats to
 * the top by itself. Goals with no horizon have no pace, so they sort *after*
 * everything that does — they are not "fine", they simply are not in that race.
 */
export function activeGoalCards(
  rows: Rows,
  todayIso: IsoDate,
  options?: RollupOptions,
): GoalCardVM[] {
  const today = parseIsoDate(todayIso) ?? startOfUtcDay(new Date());
  const names = competencyNames(rows.competencies);

  return rows.goals
    .filter((g) => g.status === 'active')
    .map((goal) => {
      const summary = goalSummary(
        goal,
        rows.goals,
        rows.milestones,
        rows.tasks,
        today,
        options,
      );
      const next = nextTaskFor(goal.id, rows.tasks);
      const paceValue = summary.pace;

      return {
        id: goal.id,
        title: goal.title,
        horizon: horizonLabel(goal),
        competency: names.get(goal.competencyId) ?? '',
        pct: percent(summary.progress.fraction),
        elapsedPct: summary.elapsed === null ? null : percent(summary.elapsed),
        doneCount: summary.progress.doneCount,
        totalCount: summary.progress.totalCount,
        milestoneLabel:
          summary.milestones.total > 0
            ? `${summary.milestones.done} of ${summary.milestones.total} milestones`
            : 'no milestones',
        nextTask: next?.title ?? null,
        paceBand: summary.paceBand,
        paceLabel:
          paceValue === null
            ? null
            : `${paceValue >= 0 ? '+' : '−'}${Math.abs(percent(paceValue))}`,
        paceColor: summary.paceBand === 'none' ? null : PACE_COLOR[summary.paceBand],
        pastTarget: summary.pastTarget,
      } satisfies GoalCardVM;
    })
    .sort((a, b) => {
      // No horizon sorts last: nothing to be behind on.
      const av = a.paceBand === 'none' ? Number.POSITIVE_INFINITY : (a.pct - (a.elapsedPct ?? 0));
      const bv = b.paceBand === 'none' ? Number.POSITIVE_INFINITY : (b.pct - (b.elapsedPct ?? 0));
      if (av !== bv) return av - bv;
      return a.title.localeCompare(b.title);
    });
}

export type DoingTaskVM = {
  id: string;
  title: string;
  goalId: string;
  goalTitle: string;
  effort: string;
  /** `4 days in`, `started today`, or `no start date`. */
  age: string;
  /** In Doing for more than 21 days — the honest signal a goal has stalled. */
  stale: boolean;
};

/** Every task currently in Doing, across all goals. The real working set. */
export function doingTasks(rows: Rows, todayIso: IsoDate): DoingTaskVM[] {
  const goalTitles = new Map(rows.goals.map((g) => [g.id, g.title]));

  return rows.tasks
    .filter((t) => t.status === 'doing')
    .map((task) => {
      const days = daysSince(task.startedOn, todayIso);
      return {
        id: task.id,
        title: task.title,
        goalId: task.goalId,
        goalTitle: goalTitles.get(task.goalId) ?? '',
        effort: task.effort,
        age:
          days === null
            ? 'no start date'
            : days <= 0
              ? 'started today'
              : `${days} day${days === 1 ? '' : 's'} in`,
        stale: days !== null && days > STALE_DAYS,
      } satisfies DoingTaskVM;
    })
    .sort((a, b) => a.goalTitle.localeCompare(b.goalTitle));
}

/**
 * The quiet line under the working set. Never a warning, never red — it states a
 * number and lets you draw the conclusion.
 */
export function inFlightNote(count: number): string {
  if (count === 0) return 'nothing in flight';
  if (count <= 8) return `${count} in flight`;
  return `${count} in flight — that is more than you can hold at once`;
}

/* --------------------------------------------------------- Zone B — Up next */

export type UpNextVM = {
  id: string;
  title: string;
  goalId: string;
  goalTitle: string;
  effort: string;
};

/**
 * Three to five suggested tasks, pulled automatically: the next unfinished task
 * from each active goal that has nothing currently in Doing. No manual queue to
 * curate, which is the point — a queue you have to groom is another obligation.
 */
export function upNextTasks(rows: Rows, limit = 5): UpNextVM[] {
  const goalTitles = new Map(rows.goals.map((g) => [g.id, g.title]));
  const busy = new Set(rows.tasks.filter((t) => t.status === 'doing').map((t) => t.goalId));

  const out: UpNextVM[] = [];
  for (const goal of rows.goals) {
    if (goal.status !== 'active' || busy.has(goal.id)) continue;
    const next = rows.tasks.find((t) => t.goalId === goal.id && t.status === 'todo');
    if (!next) continue;
    out.push({
      id: next.id,
      title: next.title,
      goalId: goal.id,
      goalTitle: goalTitles.get(goal.id) ?? '',
      effort: next.effort,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/* ----------------------------------------------- Zone C — Recently completed */

export type RecentVM = {
  key: string;
  kind: 'Milestone' | 'Win';
  goalId: string | null;
  dateIso: IsoDate;
  dateLabel: string;
  competency: string;
  title: string;
  note: string;
  evidenceUrl: string | null;
  /** Two or three characters for the evidence thumbnail. */
  thumb: string;
};

/** `github.com/x/y/pull/1183` -> `#1183`; otherwise the host, shortened. */
function thumbLabel(url: string | null, kind: 'Milestone' | 'Win'): string {
  if (!url) return kind === 'Win' ? 'win' : 'note';
  const pr = /\/(?:pull|pulls|merge_requests)\/(\d+)/.exec(url);
  if (pr) return `#${pr[1]}`;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0].slice(0, 8);
  } catch {
    return 'link';
  }
}

/**
 * The last 30 days of reached milestones and wins, newest first.
 *
 * This is the one zone with real colour, and it exists for morale as much as for
 * the record: on a week when nothing feels like it is moving, you scroll and see
 * nine things you actually did.
 */
export function recentlyCompleted(rows: Rows, todayIso: IsoDate, days = 30): RecentVM[] {
  const from = isoDaysAgo(todayIso, days);
  const names = competencyNames(rows.competencies);
  const goalTitles = new Map(rows.goals.map((g) => [g.id, g.title]));

  const fromMilestones: RecentVM[] = rows.milestones
    .filter((m) => m.status === 'done' && isoWithin(m.completedAt, from, todayIso))
    .map((m) => ({
      key: `m:${m.id}`,
      kind: 'Milestone' as const,
      goalId: m.goalId,
      dateIso: m.completedAt as IsoDate,
      dateLabel: shortDate(m.completedAt, todayIso),
      competency: names.get(m.competencyId) ?? '',
      title: m.title,
      note: m.evidenceNote ?? goalTitles.get(m.goalId) ?? '',
      evidenceUrl: m.evidenceUrl,
      thumb: thumbLabel(m.evidenceUrl, 'Milestone'),
    }));

  const fromWins: RecentVM[] = rows.wins
    .filter((w) => isoWithin(w.happenedOn, from, todayIso))
    .map((w) => ({
      key: `w:${w.id}`,
      kind: 'Win' as const,
      goalId: null,
      dateIso: w.happenedOn,
      dateLabel: shortDate(w.happenedOn, todayIso),
      competency: names.get(w.competencyId) ?? '',
      title: w.title,
      note: w.impactNote,
      evidenceUrl: w.evidenceUrl,
      thumb: thumbLabel(w.evidenceUrl, 'Win'),
    }));

  return [...fromMilestones, ...fromWins].sort((a, b) =>
    a.dateIso === b.dateIso ? a.title.localeCompare(b.title) : b.dateIso.localeCompare(a.dateIso),
  );
}

/* --------------------------------------------------------- Zone D — Backlog */

export type BacklogRowVM = {
  id: string;
  title: string;
  competency: string;
  kind: string;
  estHours: number | null;
  hoursLabel: string;
  costLabel: string;
};

export type BacklogVM = {
  /** `14 goals waiting — 4 certifications, 6 skills, 4 domains` */
  summaryLine: string;
  count: number;
  rows: BacklogRowVM[];
};

const KIND_PLURALS: Record<string, string> = {
  skill: 'skills',
  certification: 'certifications',
  domain: 'domains',
  role: 'roles',
  project: 'projects',
};

/**
 * Framed as a menu of options, never as a queue. No ages, no "sitting here eight
 * months", no overdue styling — nothing in the backlog is late, by definition.
 * Sorted by hours ascending, which answers "I have a free weekend, what can I
 * actually finish"; goals with no estimate sort last rather than reading as zero.
 */
export function backlog(rows: Rows): BacklogVM {
  const names = competencyNames(rows.competencies);
  const items = rows.goals.filter((g) => g.status === 'backlog');

  const byKind = new Map<string, number>();
  for (const goal of items) byKind.set(goal.kind, (byKind.get(goal.kind) ?? 0) + 1);

  const breakdown = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, n]) => `${n} ${n === 1 ? kind : (KIND_PLURALS[kind] ?? `${kind}s`)}`)
    .join(', ');

  const summaryLine =
    items.length === 0
      ? 'Nothing waiting in the backlog'
      : `${items.length} goal${items.length === 1 ? '' : 's'} waiting${breakdown ? ` — ${breakdown}` : ''}`;

  return {
    summaryLine,
    count: items.length,
    rows: items
      .map((goal) => ({
        id: goal.id,
        title: goal.title,
        competency: names.get(goal.competencyId) ?? '',
        kind: goal.kind,
        estHours: goal.estHours,
        hoursLabel: goal.estHours === null ? '—' : `${Math.round(goal.estHours)}h`,
        costLabel:
          goal.cost === null
            ? '—'
            : `$${goal.cost % 1 === 0 ? goal.cost.toFixed(0) : goal.cost.toFixed(2)}`,
      }))
      .sort((a, b) => {
        const ah = a.estHours ?? Number.POSITIVE_INFINITY;
        const bh = b.estHours ?? Number.POSITIVE_INFINITY;
        if (ah !== bh) return ah - bh;
        return a.title.localeCompare(b.title);
      }),
  };
}

/* ------------------------------------------------------------ Summary strip */

export type SummaryVM = {
  activeGoals: number;
  milestonesThisMonth: number;
  /** The quarter's overall task percentage, plus the label `Q3 2026`. */
  quarterPct: number;
  quarterLabel: string;
  quarterDone: number;
  quarterTotal: number;
  /** Milestones reached all time. Can only go up — that is the whole job of it. */
  allTimeMilestones: number;
  /** The year the record starts, for `since Jan 2024`. Null when there is nothing yet. */
  sinceLabel: string | null;
  weakest: { id: CompetencyId | string; name: string; count: number } | null;
};

/**
 * The thin strip across the top.
 *
 * Note what is absent: no total count of everything open, anywhere. That number is
 * available in the master table for when you actually want it, and showing it here
 * is the single fastest way to make this dashboard something you stop opening.
 */
export function summarise(
  rows: Rows,
  todayIso: IsoDate,
  options?: RollupOptions,
): SummaryVM {
  const today = parseIsoDate(todayIso) ?? startOfUtcDay(new Date());
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const quarter = quarterOfMonth(month);
  const quarterValue = `${year}-Q${quarter}`;

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const milestonesThisMonth = rows.milestones.filter(
    (m) => m.status === 'done' && isoWithin(m.completedAt, monthStart, todayIso),
  ).length;

  // The quarter's percentage: every task on a goal whose horizon window overlaps
  // this quarter. Dropped goals are excluded — an abandoned goal should not drag
  // the quarter down forever.
  const quarterWindow = horizonWindow({
    horizonType: 'quarterly',
    horizonValue: quarterValue,
    customStart: null,
    customEnd: null,
  });

  const inQuarter = new Set(
    rows.goals
      .filter((goal) => {
        if (goal.status === 'dropped') return false;
        const window = horizonWindow(goal);
        if (!window || !quarterWindow) return false;
        return (
          window.start.getTime() <= quarterWindow.end.getTime() &&
          window.end.getTime() >= quarterWindow.start.getTime()
        );
      })
      .map((g) => g.id),
  );

  const quarterProgress = progressOf(
    rows.tasks.filter((t) => inQuarter.has(t.goalId)),
    options,
  );

  // Evidence over the last 90 days, per competency: milestones reached plus wins
  // logged. Every competency is counted, including the ones with nothing — a zero
  // is exactly the figure this is here to surface.
  const ninetyDaysAgo = isoDaysAgo(todayIso, 90);
  const evidence = new Map<string, number>(rows.competencies.map((c) => [c.id, 0]));
  const bump = (id: string) => evidence.set(id, (evidence.get(id) ?? 0) + 1);

  for (const m of rows.milestones) {
    if (m.status === 'done' && isoWithin(m.completedAt, ninetyDaysAgo, todayIso)) bump(m.competencyId);
  }
  for (const w of rows.wins) {
    if (isoWithin(w.happenedOn, ninetyDaysAgo, todayIso)) bump(w.competencyId);
  }

  const ranked = rows.competencies
    .map((c) => ({ id: c.id, name: c.name, count: evidence.get(c.id) ?? 0, sortOrder: c.sortOrder }))
    .sort((a, b) => a.count - b.count || a.sortOrder - b.sortOrder);

  const doneMilestoneDates = rows.milestones
    .filter((m) => m.status === 'done' && m.completedAt)
    .map((m) => m.completedAt as string)
    .sort();
  const firstDate = doneMilestoneDates[0] ? parseIsoDate(doneMilestoneDates[0]) : null;

  return {
    activeGoals: rows.goals.filter((g) => g.status === 'active').length,
    milestonesThisMonth,
    quarterPct: percent(quarterProgress.fraction),
    quarterLabel: `Q${quarter} ${year}`,
    quarterDone: quarterProgress.doneCount,
    quarterTotal: quarterProgress.totalCount,
    allTimeMilestones: rows.milestones.filter((m) => m.status === 'done').length,
    sinceLabel: firstDate
      ? `${monthAbbr(firstDate.getUTCMonth() + 1)} ${firstDate.getUTCFullYear()}`
      : null,
    weakest: ranked[0] ? { id: ranked[0].id, name: ranked[0].name, count: ranked[0].count } : null,
  };
}
