/**
 * Completion trend — tasks completed per week over the last twelve weeks.
 *
 * Weekly, never daily. The spec is explicit about why: daily granularity turns
 * learning into a guilt machine, because a normal week of a normal job has three
 * empty days in it and a daily chart renders those as failure. A week is the
 * smallest honest unit here — it answers "am I still moving?" and nothing else.
 *
 * What this chart must never grow: a streak, a run length, a "best week" marker,
 * or any styling that makes a quiet week look like a debt. An empty week is a
 * neutral stub on the baseline, the same neutral the heatmap uses for an empty
 * day. Colour marks what is done; nothing here marks what is owed.
 *
 * Hand-written SVG, no charting library — house style, and a bar chart is twelve
 * rectangles. The marks are SVG (`preserveAspectRatio="none"`, so the bars stretch
 * to whatever width the panel has); every piece of text is HTML beside it, so type
 * never scales down to six pixels on a phone.
 *
 * Presentation notes, after the redesign:
 *
 *   - No card. A ruled heading, a readout, the marks, and a hairline under the
 *     footnote. The one panel on the dashboard allowed a raised surface is
 *     Recently completed, and a chart is not it.
 *   - The scale is labelled in the left gutter — peak at the top, zero on the
 *     baseline — because an instrument that does not say what its marks mean is
 *     decoration. The labels are HTML, so they never stretch with the bars.
 *   - Bars are square. `preserveAspectRatio="none"` turns a corner radius into a
 *     stretched ellipse, and square marks are the honest shape here anyway.
 *   - No entrance animation. Twelve bars growing on every page load is the
 *     generated-dashboard default; motion here would answer nothing anyone did.
 */

import { monthAbbr, parseIsoDate, toIsoDate } from '@/lib/career/horizon';
import type { IsoDate } from '@/lib/career/types';
// One definition of "which week is this", shared with the weekly review, so the
// chart's bars and the review's window can never disagree about a Monday.
import { startOfWeek } from '../WeeklyReview/digest';

export { startOfWeek };

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ the maths */

/** Everything this chart needs from a task. A `Task` row satisfies it. */
export type TrendTask = {
  status: string;
  completedAt: IsoDate | null;
};

export type WeekBucket = {
  /** Monday of the week, `YYYY-MM-DD`. */
  start: IsoDate;
  /** Sunday of the week, `YYYY-MM-DD`. */
  end: IsoDate;
  count: number;
  /** `8 Sep`, for the tooltip. */
  label: string;
  /** Set only on the first bucket of a new month, for the axis. */
  monthLabel: string | null;
};

function dayLabel(date: Date): string {
  return `${date.getUTCDate()} ${monthAbbr(date.getUTCMonth() + 1)}`;
}

/**
 * Twelve buckets ending with the week that contains `today`, oldest first.
 *
 * Tasks are counted by `completedAt`, not by `updatedAt`: back-dating a task you
 * finished last Thursday must move it to last Thursday's bar, or the chart
 * quietly rewards logging promptly rather than working.
 */
export function weeklyCompletions(
  tasks: readonly TrendTask[],
  today: Date | IsoDate,
  weeks = 12,
): WeekBucket[] {
  const anchor = typeof today === 'string' ? (parseIsoDate(today) ?? new Date()) : today;
  const thisWeek = startOfWeek(anchor);
  const span = Math.max(1, Math.trunc(weeks));

  const buckets: WeekBucket[] = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const start = new Date(thisWeek.getTime() - i * 7 * DAY_MS);
    const end = new Date(start.getTime() + 6 * DAY_MS);
    buckets.push({
      start: toIsoDate(start),
      end: toIsoDate(end),
      count: 0,
      label: dayLabel(start),
      monthLabel: null,
    });
  }

  const first = buckets[0].start;
  const last = buckets[buckets.length - 1].end;
  const byStart = new Map(buckets.map((bucket) => [bucket.start, bucket]));

  for (const task of tasks) {
    if (task.status !== 'done' || !task.completedAt) continue;
    const done = task.completedAt;
    // String compare is safe and cheap on `YYYY-MM-DD`, and it sidesteps any
    // timezone question — these are calendar days, not instants.
    if (done < first || done > last) continue;
    const parsed = parseIsoDate(done);
    // A malformed date is dropped from the chart rather than thrown over: one bad
    // row must not be able to blank the whole card.
    if (!parsed) continue;
    const bucket = byStart.get(toIsoDate(startOfWeek(parsed)));
    if (bucket) bucket.count += 1;
  }

  // Month label on the first bucket of each month, and always on the first bucket
  // so the axis is never unlabelled.
  let seen: string | null = null;
  for (const bucket of buckets) {
    const month = bucket.start.slice(0, 7);
    if (month !== seen) {
      seen = month;
      bucket.monthLabel = monthAbbr(Number(month.slice(5, 7)));
    }
  }

  return buckets;
}

/* ----------------------------------------------------------------- the chart */

/**
 * Geometry in SVG user units. Both axes stretch to the element's box, so these are
 * ratios rather than pixels: `BAR:GAP` is the only thing that survives into the
 * rendered chart, and `HEIGHT` is just the number the bar maths divides by.
 */
const BAR = 5;
const GAP = 5;
const HEIGHT = 100;
/** An empty week is a neutral stub on the baseline. Never a gap, never a warning. */
const STUB = 2;

export type CompletionTrendProps = {
  tasks: readonly TrendTask[];
  /** The server's idea of today, threaded through so the browser cannot disagree. */
  today: Date | IsoDate;
  weeks?: number;
  /** Accepted so the public and admin trees can render this identically. Charts read. */
  editable?: boolean;
  className?: string;
};

export default function CompletionTrend({
  tasks,
  today,
  weeks = 12,
  className,
}: CompletionTrendProps) {
  const buckets = weeklyCompletions(tasks, today, weeks);
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const peak = Math.max(1, ...buckets.map((b) => b.count));
  const width = buckets.length * (BAR + GAP) - GAP;

  return (
    <section className={className} aria-labelledby="completion-trend-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-strong pb-2">
        <h2 id="completion-trend-title" className="type-display m-0 text-[17px] text-ink">
          Completion trend
        </h2>
        <span className="text-[12px] text-ink-muted">
          tasks completed, last {buckets.length} weeks
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="type-readout text-[34px] text-ink">{total}</span>
        <span className="text-[12.5px] text-ink-muted">
          {total === 1 ? 'task finished in that window' : 'tasks finished in that window'}
        </span>
      </div>

      {/* Twelve marks have a natural size, and a full-width dashboard panel is far
          past it: stretched to 1000px these become a wall of colour rather than a
          reading. The plot is capped and left-aligned instead, which is also why the
          gutter, the marks and the month labels all live inside one wrapper.

          The scale lives in that gutter as HTML: it must not stretch with the marks,
          and it must stay readable at 390px. `w-7` + `gap-2` is the 36px the axis
          labels below are padded by, so the two rows line up. */}
      <div className="mt-4 max-w-[460px]">
        <div className="flex items-stretch gap-2">
          <div className="type-condensed flex w-7 shrink-0 flex-col justify-between text-right text-[10.5px] text-ink-faint">
            <span>{peak}</span>
            <span>0</span>
          </div>

          <div className="min-w-0 flex-1">
            <svg
              viewBox={`0 0 ${width} ${HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${total} tasks completed over the last ${buckets.length} weeks, by week. The busiest week held ${peak}.`}
              className="block h-[84px] w-full sm:h-[104px]"
            >
              {buckets.map((bucket, i) => {
                const x = i * (BAR + GAP);
                const height =
                  bucket.count === 0 ? STUB : Math.max(3, (bucket.count / peak) * HEIGHT);
                return (
                  <g key={bucket.start}>
                    <title>
                      {`Week of ${bucket.label} — ${bucket.count} ${bucket.count === 1 ? 'task' : 'tasks'}`}
                    </title>
                    <rect
                      x={x}
                      y={HEIGHT - height}
                      width={BAR}
                      height={height}
                      fill={bucket.count === 0 ? 'var(--track)' : 'var(--signal)'}
                    />
                  </g>
                );
              })}
            </svg>
            {/* The baseline is a real hairline rather than an SVG stroke, so it is
                exactly 1px at every width the panel takes. */}
            <div className="h-px w-full bg-rule-strong" />
          </div>
        </div>

        <div className="mt-1.5 flex pl-9" aria-hidden>
          {buckets.map((bucket) => (
            <span
              key={bucket.start}
              className="type-condensed min-w-0 flex-1 text-center text-[10px] text-ink-faint"
            >
              {bucket.monthLabel ?? ''}
            </span>
          ))}
        </div>
      </div>

      <p className="m-0 mt-4 border-t border-rule pt-3 text-[12.5px] leading-[1.5] text-ink-muted">
        Weekly, not daily, and the last bar is a week still running. A quiet week is a quiet
        week — it is not a miss, and nothing here counts how many of them ran together.
      </p>
    </section>
  );
}
