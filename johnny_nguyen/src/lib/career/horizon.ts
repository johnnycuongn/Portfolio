/**
 * Career dashboard — horizons. Pure functions, no database, no clock of their own
 * (every function that needs "today" takes it as an argument, which is what makes
 * them testable).
 *
 * `target_date` is never a stored column. A goal stores a horizon *type* and a
 * *value* — `monthly` + `2026-09` — and the date derives from the pair. One field
 * to edit, one place to change the rule, and no chance of a stored date drifting
 * out of step with the period it is supposed to represent.
 *
 * Timezone policy: all dates are UTC midnight. A `date` column is a calendar day
 * with no time and no zone, so pinning the in-memory representation to UTC is what
 * stops a server in one zone and a browser in another from disagreeing about which
 * day a thing happened. Callers that need "today" as a local calendar day should
 * build it with `utcDate(y, m, d)` from their own local parts.
 */

import type { HorizonSpec, IsoDate } from './types';

/* ------------------------------------------------------------------- utilities */

const DAY_MS = 86_400_000;

/** A UTC-midnight Date. `month` is 1-based, the way humans and ISO strings write it. */
export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Parses `YYYY-MM-DD`. Returns null for anything else, including impossible dates. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = utcDate(Number(y), Number(mo), Number(d));
  // Rejects 2026-02-30, which Date.UTC would silently roll forward into March.
  if (date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) return null;
  return date;
}

/** Formats a Date as `YYYY-MM-DD` in UTC — the shape every `date` column stores. */
export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Last calendar day of a 1-based month. Day 0 of the next month is the last of this one. */
export function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

/** 1-based quarter (1–4) containing a 1-based month. */
export function quarterOfMonth(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

/** Whole days between two UTC-midnight dates, `b - a`. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Strips any time component, keeping the UTC calendar day. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/* ------------------------------------------------------------ horizon windows */

export type HorizonWindow = { start: Date; end: Date };

/**
 * The period a horizon value names, as a closed day range (both ends inclusive).
 * Null when the goal has no horizon, or when a custom goal is missing either date.
 *
 *   monthly   '2026-09'   -> 2026-09-01 .. 2026-09-30
 *   quarterly '2026-Q3'   -> 2026-07-01 .. 2026-09-30
 *   yearly    '2026'      -> 2026-01-01 .. 2026-12-31
 *   custom                -> custom_start .. custom_end
 *   none                  -> null
 */
export function horizonWindow(goal: HorizonSpec): HorizonWindow | null {
  const value = goal.horizonValue?.trim() ?? '';

  switch (goal.horizonType) {
    case 'monthly': {
      const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
      if (!m) return null;
      const year = Number(m[1]);
      const month = Number(m[2]);
      return { start: utcDate(year, month, 1), end: lastDayOfMonth(year, month) };
    }
    case 'quarterly': {
      const m = /^(\d{4})-Q([1-4])$/i.exec(value);
      if (!m) return null;
      const year = Number(m[1]);
      const quarter = Number(m[2]);
      const firstMonth = (quarter - 1) * 3 + 1;
      return {
        start: utcDate(year, firstMonth, 1),
        end: lastDayOfMonth(year, firstMonth + 2),
      };
    }
    case 'yearly': {
      const m = /^(\d{4})$/.exec(value);
      if (!m) return null;
      const year = Number(m[1]);
      return { start: utcDate(year, 1, 1), end: utcDate(year, 12, 31) };
    }
    case 'custom': {
      const start = parseIsoDate(goal.customStart);
      const end = parseIsoDate(goal.customEnd);
      // A custom horizon needs both ends; one alone is not a window to pace against.
      if (!start || !end || end.getTime() < start.getTime()) return null;
      return { start, end };
    }
    default:
      return null;
  }
}

/**
 * The derived deadline: the last day of the horizon period, or the custom end date.
 * Null for `none` — and for a horizon whose value is malformed, which is the same
 * answer the UI wants (show progress, show no pace) rather than a throw.
 */
export function targetDate(goal: HorizonSpec): Date | null {
  if (goal.horizonType === 'custom') {
    // Deliberately independent of horizonWindow: an end date with no start is still
    // a real deadline, it just cannot be paced.
    return parseIsoDate(goal.customEnd);
  }
  return horizonWindow(goal)?.end ?? null;
}

/** `targetDate` as a `YYYY-MM-DD` string, for rendering and sorting. */
export function targetDateIso(goal: HorizonSpec): IsoDate | null {
  const date = targetDate(goal);
  return date ? toIsoDate(date) : null;
}

/**
 * How much of the horizon window has gone, 0–1 inclusive, counting whole days and
 * counting today as elapsed. On the first day of a 30-day month this is 1/30, and
 * on the last day it is 1. Before the window it is 0; after it, 1.
 *
 * Null when the goal has no horizon — which is how pace stays null too. Goals
 * without a horizon are never judged on speed, and that is the entire point of
 * being allowed to leave the horizon off.
 */
export function elapsedFraction(goal: HorizonSpec, today: Date): number | null {
  const window = horizonWindow(goal);
  if (!window) return null;

  const day = startOfUtcDay(today);
  const totalDays = daysBetween(window.start, window.end) + 1;
  if (totalDays <= 0) return null;

  const elapsedDays = daysBetween(window.start, day) + 1;
  if (elapsedDays <= 0) return 0;
  if (elapsedDays >= totalDays) return 1;
  return elapsedDays / totalDays;
}

/** Whether the goal has a target date that is already behind us. */
export function isPastTarget(goal: HorizonSpec, today: Date): boolean {
  const target = targetDate(goal);
  if (!target) return false;
  return startOfUtcDay(today).getTime() > target.getTime();
}

/**
 * The period a new goal should default to when a horizon type is picked — the spec's
 * "set a type and the value defaults to the current period". Null for none/custom,
 * neither of which carries a value.
 */
export function currentHorizonValue(
  horizonType: HorizonSpec['horizonType'],
  today: Date,
): string | null {
  const day = startOfUtcDay(today);
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth() + 1;

  switch (horizonType) {
    case 'monthly':
      return `${year}-${String(month).padStart(2, '0')}`;
    case 'quarterly':
      return `${year}-Q${quarterOfMonth(month)}`;
    case 'yearly':
      return String(year);
    default:
      return null;
  }
}

/**
 * Hardcoded rather than `toLocaleString`: ICU disagrees with itself across Node
 * versions and browsers about September ("Sep" vs "Sept"), and a badge that changes
 * width between server render and hydration is a layout shift for no benefit.
 */
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** `Sep`, from a 1-based month. */
export function monthAbbr(month: number): string {
  return MONTH_ABBR[month - 1] ?? '';
}

/** A short label for a horizon badge: `Sep 2026`, `Q3 2026`, `2026`, `to 12 Mar`, `No horizon`. */
export function horizonLabel(goal: HorizonSpec): string {
  const value = goal.horizonValue?.trim() ?? '';
  switch (goal.horizonType) {
    case 'monthly': {
      const window = horizonWindow(goal);
      if (!window) return value || 'Monthly';
      return `${monthAbbr(window.start.getUTCMonth() + 1)} ${window.start.getUTCFullYear()}`;
    }
    case 'quarterly': {
      const m = /^(\d{4})-Q([1-4])$/i.exec(value);
      return m ? `Q${m[2]} ${m[1]}` : value || 'Quarterly';
    }
    case 'yearly':
      return value || 'Yearly';
    case 'custom': {
      const end = parseIsoDate(goal.customEnd);
      if (!end) return 'Custom';
      return `to ${end.getUTCDate()} ${monthAbbr(end.getUTCMonth() + 1)}`;
    }
    default:
      return 'No horizon';
  }
}
