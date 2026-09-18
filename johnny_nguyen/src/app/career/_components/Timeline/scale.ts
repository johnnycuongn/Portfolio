/**
 * Timeline — the time axis, in pure functions.
 *
 * Nothing here touches React or the database. The component measures its own
 * width, picks a zoom level, and asks this module where everything sits; keeping
 * the arithmetic out of the render makes it the one part of the timeline that can
 * be reasoned about (and asserted on) without a browser.
 *
 * Two conventions the rest of the file depends on:
 *   - Every date is a UTC-midnight `Date`, the same policy as `@/lib/career/horizon`.
 *     A `date` column is a calendar day, so a browser east of the server must not
 *     be able to shift a bar by one column.
 *   - A range is closed at both ends: `{ start: 1 Sep, end: 30 Sep }` is 30 days
 *     wide, not 29. A one-day milestone is therefore a real, visible bar rather
 *     than a zero-width sliver.
 */

import {
  daysBetween,
  monthAbbr,
  parseIsoDate,
  startOfUtcDay,
  utcDate,
} from '@/lib/career/horizon';
import type { IsoDate } from '@/lib/career/types';

/* -------------------------------------------------------------- shared origin */

/**
 * Where labels stop and the time axis starts, in pixels from the panel's left
 * edge. The timeline's goal-name column and the heatmap's caption gutter are both
 * this wide, so the rule between the two is *one* vertical line running down
 * through both panels rather than two lines that nearly agree.
 *
 * It lives here rather than in either component because it is the one measurement
 * the two share, and a second copy of it is a copy that drifts.
 */
export const AXIS_ORIGIN = 280;

/**
 * The same measurement as a Tailwind class, for the parts of both panels that are
 * laid out by the cascade rather than positioned in pixels (the caption gutters,
 * which collapse entirely below `md`). It lives on the line below the number so
 * the two cannot drift apart unnoticed.
 */
export const AXIS_ORIGIN_CLASS = 'md:w-[280px]';

/* ---------------------------------------------------------------------- zoom */

export const TIMELINE_ZOOMS = ['month', 'quarter', 'year'] as const;
export type TimelineZoom = (typeof TIMELINE_ZOOMS)[number];

/**
 * How many days fill the visible width at each zoom. These are what make the
 * zoom control mean something: at `month` a month spans the viewport, at `year`
 * a year does. Everything outside the viewport is still there — it is reached by
 * scrolling horizontally, not by zooming out.
 */
export const ZOOM_WINDOW_DAYS: Record<TimelineZoom, number> = {
  month: 31,
  quarter: 92,
  year: 366,
};

export const ZOOM_LABELS: Record<TimelineZoom, string> = {
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

/* ------------------------------------------------------------------- ranges */

/** A closed day range. Both ends are inclusive. */
export type DayRange = { start: Date; end: Date };

const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** First day of the month a date falls in. */
export function startOfMonth(date: Date): Date {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/** Last day of the month a date falls in. */
export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/** Inclusive day count of a range. Never below 1. */
export function rangeDays(range: DayRange): number {
  return Math.max(1, daysBetween(range.start, range.end) + 1);
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function clampDate(date: Date, range: DayRange): Date {
  return minDate(maxDate(date, range.start), range.end);
}

/* ------------------------------------------------------------------- domain */

/**
 * The full scrollable extent of the grid: every goal window that exists, plus a
 * margin around today so the view is never pinned hard against an edge.
 *
 * Past goals deliberately stay in the domain — the spec wants scrolling back
 * through last year to double as a year-in-review, so nothing is trimmed off the
 * left. Both ends snap to month boundaries so the axis ticks land on whole months.
 */
export function timelineDomain(windows: readonly DayRange[], today: Date): DayRange {
  const day = startOfUtcDay(today);
  let start = addDays(day, -45);
  let end = addDays(day, 150);

  for (const window of windows) {
    start = minDate(start, window.start);
    end = maxDate(end, window.end);
  }

  return { start: startOfMonth(start), end: endOfMonth(end) };
}

/* ---------------------------------------------------------------- positions */

/** Pixels from the left edge of the domain to the start of a day. */
export function offsetPx(domain: DayRange, date: Date, pxPerDay: number): number {
  return daysBetween(domain.start, startOfUtcDay(date)) * pxPerDay;
}

/** The date at a pixel offset — the inverse of `offsetPx`, for reading the scroll position. */
export function dateAtPx(domain: DayRange, px: number, pxPerDay: number): Date {
  if (pxPerDay <= 0) return domain.start;
  return addDays(domain.start, Math.floor(px / pxPerDay));
}

export type BarGeometry = { left: number; width: number };

/**
 * A bar's box in pixels, clipped to the domain. Null when the range falls entirely
 * outside — the caller draws no bar at all rather than a bar of width zero.
 *
 * The minimum width is 3px: a single-day milestone on a year zoom is still a mark
 * you can see and hover, which is better than a bar that silently vanishes when
 * you zoom out.
 */
export function barGeometry(
  domain: DayRange,
  range: DayRange,
  pxPerDay: number,
): BarGeometry | null {
  if (range.end.getTime() < domain.start.getTime()) return null;
  if (range.start.getTime() > domain.end.getTime()) return null;

  const start = clampDate(range.start, domain);
  const end = clampDate(range.end, domain);
  const left = offsetPx(domain, start, pxPerDay);
  const width = Math.max(3, (daysBetween(start, end) + 1) * pxPerDay);
  return { left, width };
}

/* --------------------------------------------------------------- axis ticks */

export type AxisTick = {
  key: string;
  left: number;
  label: string;
  /** Major ticks (a January, or the first of a month) carry a darker rule. */
  major: boolean;
};

/**
 * Ticks for the visible zoom. Weeks at month zoom, months at quarter zoom, and
 * months-with-years at year zoom — enough to locate yourself, never so many that
 * the grid turns into graph paper.
 */
export function axisTicks(domain: DayRange, zoom: TimelineZoom, pxPerDay: number): AxisTick[] {
  const ticks: AxisTick[] = [];

  if (zoom === 'month') {
    // Weekly marks on the 1st, 8th, 15th, 22nd and 29th of every month in range.
    let cursor = startOfMonth(domain.start);
    while (cursor.getTime() <= domain.end.getTime()) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth() + 1;
      const lastDay = endOfMonth(cursor).getUTCDate();
      for (const day of [1, 8, 15, 22, 29]) {
        if (day > lastDay) continue;
        const date = utcDate(year, month, day);
        if (date.getTime() < domain.start.getTime()) continue;
        if (date.getTime() > domain.end.getTime()) continue;
        ticks.push({
          key: `${year}-${month}-${day}`,
          left: offsetPx(domain, date, pxPerDay),
          label: day === 1 ? `${monthAbbr(month)} ${day}` : `${day}`,
          major: day === 1,
        });
      }
      cursor = utcDate(year, month, 1);
      cursor = addDays(endOfMonth(cursor), 1);
    }
    return ticks;
  }

  let cursor = startOfMonth(domain.start);
  while (cursor.getTime() <= domain.end.getTime()) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const january = month === 1;
    ticks.push({
      key: `${year}-${month}`,
      left: offsetPx(domain, cursor, pxPerDay),
      label: january ? `${monthAbbr(month)} ${year}` : monthAbbr(month),
      major: january,
    });
    cursor = addDays(endOfMonth(cursor), 1);
  }
  return ticks;
}

/** `Aug 2026 – Dec 2026`, or `Sep 2026` when both ends share a month. */
export function rangeLabel(start: Date, end: Date): string {
  const left = `${monthAbbr(start.getUTCMonth() + 1)} ${start.getUTCFullYear()}`;
  const right = `${monthAbbr(end.getUTCMonth() + 1)} ${end.getUTCFullYear()}`;
  return left === right ? left : `${left} – ${right}`;
}

/* ------------------------------------------------------------ milestone spans */

/** Just enough of a milestone row to place it. A `Milestone` row satisfies this. */
export type SpannableMilestone = {
  id: string;
  sortOrder: number;
  targetDate: IsoDate | null;
};

/**
 * Where each milestone bar sits inside its goal's window.
 *
 * Milestones store a target date and nothing else — there is no start column, and
 * inventing one per milestone would be a field to maintain for a line on a chart.
 * So the sequence itself supplies the starts: a milestone runs from the end of the
 * one before it up to its own target date, and a run of milestones with no dates
 * shares the remaining span evenly until the next anchor.
 *
 * The result is honest about what is known (a dated milestone always ends on its
 * date) and plainly derived about what is not (undated ones are evenly spaced),
 * and every bar stays inside the parent's span, which is what the spec asks for.
 */
export function milestoneSpans(
  goalWindow: DayRange,
  milestones: readonly SpannableMilestone[],
): Map<string, DayRange> {
  const spans = new Map<string, DayRange>();
  const ordered = [...milestones].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  if (ordered.length === 0) return spans;

  // A target date outside the goal's window is clamped into it rather than dropped:
  // the milestone is still real, it just cannot be drawn outside its parent.
  const anchors = ordered.map((milestone) => {
    const parsed = parseIsoDate(milestone.targetDate);
    return parsed ? clampDate(parsed, goalWindow) : null;
  });

  let cursor = goalWindow.start;
  let index = 0;

  while (index < ordered.length) {
    const anchor = anchors[index];

    if (anchor) {
      const end = maxDate(anchor, cursor);
      spans.set(ordered[index].id, { start: cursor, end });
      cursor = minDate(addDays(end, 1), goalWindow.end);
      index += 1;
      continue;
    }

    // A run of undated milestones, sharing the space up to the next dated one
    // (exclusive) or to the end of the goal window.
    let next = index;
    while (next < ordered.length && !anchors[next]) next += 1;
    const limit =
      next < ordered.length
        ? maxDate(addDays(anchors[next] as Date, -1), cursor)
        : goalWindow.end;

    const count = next - index;
    const available = Math.max(1, daysBetween(cursor, limit) + 1);
    const per = Math.max(1, Math.floor(available / count));

    for (let k = index; k < next; k += 1) {
      const isLast = k === next - 1;
      const end = isLast ? maxDate(limit, cursor) : minDate(addDays(cursor, per - 1), limit);
      spans.set(ordered[k].id, { start: cursor, end: maxDate(end, cursor) });
      cursor = minDate(addDays(maxDate(end, cursor), 1), goalWindow.end);
    }

    index = next;
  }

  return spans;
}

/* ------------------------------------------------------------- deadline rail */

export type RailItem = {
  key: string;
  /** `YYYY-MM-DD`, for sorting and for the master-table link. */
  dateIso: IsoDate;
  date: Date;
  /** `25 Sep` — short, tabular. */
  dateLabel: string;
  title: string;
  /** `In <goal title>`, or the goal's own horizon (`Q4 2026`). */
  context: string;
  goalId: string;
  /** Days from today. Zero is today; never negative, the rail looks forward only. */
  daysAway: number;
};

export type RailSource = {
  goals: ReadonlyArray<{ id: string; title: string; horizonLabel: string; targetDate: Date | null }>;
  milestones: ReadonlyArray<{
    id: string;
    goalId: string;
    goalTitle: string;
    title: string;
    targetDate: IsoDate | null;
  }>;
};

/**
 * Everything falling due in the next N days, soonest first.
 *
 * Deliberately forward-only. An overdue item is already visible on the grid as a
 * bar the today-line has run past; repeating it here as a list of things you are
 * late for is the kind of accumulating obligation the spec spends a page warning
 * against.
 */
export function dueSoon(source: RailSource, today: Date, days = 30): RailItem[] {
  const from = startOfUtcDay(today);
  const until = addDays(from, days);
  const items: RailItem[] = [];

  const push = (
    key: string,
    date: Date,
    title: string,
    context: string,
    goalId: string,
  ): void => {
    if (date.getTime() < from.getTime() || date.getTime() > until.getTime()) return;
    items.push({
      key,
      dateIso: date.toISOString().slice(0, 10),
      date,
      dateLabel: `${date.getUTCDate()} ${monthAbbr(date.getUTCMonth() + 1)}`,
      title,
      context,
      goalId,
      daysAway: daysBetween(from, date),
    });
  };

  for (const goal of source.goals) {
    if (!goal.targetDate) continue;
    push(`goal:${goal.id}`, goal.targetDate, goal.title, goal.horizonLabel, goal.id);
  }

  for (const milestone of source.milestones) {
    const date = parseIsoDate(milestone.targetDate);
    if (!date) continue;
    push(
      `milestone:${milestone.id}`,
      date,
      milestone.title,
      `In ${milestone.goalTitle}`,
      milestone.goalId,
    );
  }

  return items.sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.title.localeCompare(b.title),
  );
}
