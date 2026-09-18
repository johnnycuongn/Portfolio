/**
 * Quarter burn-up — two lines, and the spec says two lines, no more.
 *
 *   1. Cumulative tasks completed this quarter, in the accent. It only ever rises.
 *   2. A straight reference line: the pace that finishes everything committed to
 *      this quarter by the last day of it. Grey, dashed, and inert.
 *
 * Scoped to the quarter because that is the horizon whose outcome you can still
 * change. Committed means "tasks on goals whose computed target date lands inside
 * this quarter" — a goal with no horizon is deliberately not in here, and never
 * drags the line down for being slow.
 *
 * Nothing in this chart is red and nothing says "behind". The gap between the two
 * lines is the whole message, and it is legible without being shouted at.
 *
 * Hand-written SVG, no charting library. The marks stretch to the element's box
 * (`preserveAspectRatio="none"` + `vector-effect="non-scaling-stroke"`, so the
 * strokes stay hairline at any width) and every label is HTML beside them, which
 * is also what keeps the type off the phone's six-pixel floor.
 *
 * No card. A ruled heading, a readout, the plot, a legend under a hairline — the
 * same shape as the completion trend, because two charts sitting side by side that
 * disagree about their own chrome read as two products.
 */

import {
  lastDayOfMonth,
  monthAbbr,
  parseIsoDate,
  quarterOfMonth,
  startOfUtcDay,
  targetDate,
  toIsoDate,
  utcDate,
} from '@/lib/career/horizon';
import type { HorizonSpec, IsoDate } from '@/lib/career/types';

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ the maths */

/** A `Goal` row satisfies this. */
export type BurnupGoal = HorizonSpec & {
  id: string;
  status: string;
};

/** A `Task` row satisfies this. */
export type BurnupTask = {
  goalId: string;
  status: string;
  completedAt: IsoDate | null;
};

export type QuarterWindow = {
  start: IsoDate;
  end: IsoDate;
  /** `Q3 2026`. */
  label: string;
  /** Inclusive day count. */
  days: number;
};

/** The calendar quarter containing `today`. */
export function quarterWindow(today: Date | IsoDate): QuarterWindow {
  const anchor =
    typeof today === 'string' ? (parseIsoDate(today) ?? new Date()) : startOfUtcDay(today);
  const year = anchor.getUTCFullYear();
  const quarter = quarterOfMonth(anchor.getUTCMonth() + 1);
  const firstMonth = (quarter - 1) * 3 + 1;
  const start = utcDate(year, firstMonth, 1);
  const end = lastDayOfMonth(year, firstMonth + 2);
  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
    label: `Q${quarter} ${year}`,
    days: Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1,
  };
}

export type BurnupSeries = QuarterWindow & {
  /** Tasks on goals targeting this quarter. Zero means nothing is committed yet. */
  committed: number;
  /** Of those, the ones already finished before the quarter opened. */
  baseline: number;
  /** Cumulative completed, one entry per day from the quarter's start to today. */
  actual: number[];
  /** 0-based index of today within the quarter. */
  todayIndex: number;
  /** Cumulative completed as of today — the loud number. */
  done: number;
  /** Where the straight line sits today. Never rendered as a deficit. */
  requiredToday: number;
};

/**
 * The two series, in one pass.
 *
 * Tasks finished before the quarter opened are carried as a baseline rather than
 * dropped: they are part of what was committed, and starting the line at zero
 * would invent a quarter's worth of work that was already done.
 */
export function burnupSeries(input: {
  goals: readonly BurnupGoal[];
  tasks: readonly BurnupTask[];
  today: Date | IsoDate;
}): BurnupSeries {
  const window = quarterWindow(input.today);
  const todayIso =
    typeof input.today === 'string' ? input.today : toIsoDate(startOfUtcDay(input.today));

  const scoped = new Set<string>();
  for (const goal of input.goals) {
    if (goal.status === 'dropped') continue;
    const target = targetDate(goal);
    if (!target) continue;
    const iso = toIsoDate(target);
    if (iso >= window.start && iso <= window.end) scoped.add(goal.id);
  }

  let committed = 0;
  let baseline = 0;
  const perDay = new Map<IsoDate, number>();

  for (const task of input.tasks) {
    if (!scoped.has(task.goalId)) continue;
    committed += 1;
    if (task.status !== 'done' || !task.completedAt) continue;
    if (task.completedAt < window.start) {
      baseline += 1;
      continue;
    }
    if (task.completedAt > window.end) continue;
    perDay.set(task.completedAt, (perDay.get(task.completedAt) ?? 0) + 1);
  }

  const clampedToday = todayIso < window.start ? window.start : todayIso > window.end ? window.end : todayIso;
  const startDate = parseIsoDate(window.start) as Date;
  const todayIndex = Math.round(
    ((parseIsoDate(clampedToday) as Date).getTime() - startDate.getTime()) / DAY_MS,
  );

  const actual: number[] = [];
  let running = baseline;
  for (let i = 0; i <= todayIndex; i += 1) {
    running += perDay.get(toIsoDate(new Date(startDate.getTime() + i * DAY_MS))) ?? 0;
    actual.push(running);
  }

  // The straight line, evaluated at today. Day 0 sits at the baseline and the
  // final day sits at everything committed.
  const span = Math.max(1, window.days - 1);
  const requiredToday = baseline + ((committed - baseline) * todayIndex) / span;

  return {
    ...window,
    committed,
    baseline,
    actual,
    todayIndex,
    done: running,
    requiredToday,
  };
}

/* ----------------------------------------------------------------- the chart */

/**
 * The y axis in user units. Both axes stretch to the element's box, so this is a
 * ratio, not a pixel height — the element's own height is set in CSS so it can
 * shrink on a phone without the maths knowing.
 */
const HEIGHT = 100;
const PAD_TOP = 6;
const PAD_BOTTOM = 5;

function dayLabel(iso: IsoDate): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  return `${date.getUTCDate()} ${monthAbbr(date.getUTCMonth() + 1)}`;
}

export type QuarterBurnupProps = {
  goals: readonly BurnupGoal[];
  tasks: readonly BurnupTask[];
  /** The server's idea of today, threaded through so the browser cannot disagree. */
  today: Date | IsoDate;
  /** Accepted so the public and admin trees can render this identically. Charts read. */
  editable?: boolean;
  className?: string;
};

export default function QuarterBurnup({ goals, tasks, today, className }: QuarterBurnupProps) {
  const series = burnupSeries({ goals, tasks, today });

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-strong pb-2">
      <h2 className="type-display m-0 text-[17px] text-ink">Quarter burn-up</h2>
      <span className="type-condensed text-[12px] text-ink-muted">{series.label}</span>
    </div>
  );

  // Nothing committed is an ordinary state, not an error — most of the backlog has
  // no horizon on purpose. Say so plainly and draw nothing.
  if (series.committed === 0) {
    return (
      <section className={className} aria-label="Quarter burn-up">
        {header}
        <p className="m-0 mt-4 max-w-[62ch] text-[13px] leading-[1.55] text-ink-muted">
          Nothing carries a target date inside {series.label} yet. Give a goal a quarterly
          horizon and its tasks appear here — until then there is no pace to keep.
        </p>
      </section>
    );
  }

  const width = Math.max(1, series.days - 1);
  const maxY = Math.max(series.committed, series.done, 1);
  const plot = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const y = (value: number) => PAD_TOP + plot - (value / maxY) * plot;

  const actualPoints = series.actual.map((value, i) => `${i},${y(value)}`).join(' ');
  const referencePoints = `0,${y(series.baseline)} ${width},${y(series.committed)}`;

  return (
    <section className={className} aria-label="Quarter burn-up">
      {header}

      {/* Done is the loud number; the total is small and second to it. */}
      <div className="mt-4 flex items-baseline gap-2">
        <span className="type-readout text-[34px] text-ink">{series.done}</span>
        <span className="text-[12.5px] text-ink-muted">
          of {series.committed} committed this quarter
        </span>
      </div>

      {/* Capped and left-aligned, like the trend, but wider: ninety days of a rising
          line can use the room that twelve bars cannot. */}
      <div className="mt-4 max-w-[680px]">
        <div className="flex items-stretch gap-2">
          {/* Same 36px gutter as the completion trend, so two charts stacked on the
              dashboard share one left edge for their marks. */}
          <div className="type-condensed flex w-7 shrink-0 flex-col justify-between text-right text-[10.5px] text-ink-faint">
            <span>{series.committed}</span>
            <span>0</span>
          </div>

          <div className="min-w-0 flex-1">
            <svg
              viewBox={`0 0 ${width} ${HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${series.done} of ${series.committed} committed tasks completed in ${series.label}. The reference pace sits at ${Math.round(series.requiredToday)} today.`}
              className="block h-[132px] w-full overflow-visible sm:h-[168px]"
            >
              {/* Today, behind both lines: a reading, not a mark of its own. */}
              <line
                x1={series.todayIndex}
                y1={0}
                x2={series.todayIndex}
                y2={y(0)}
                stroke="var(--rule-strong)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />

              {/* Where the quarter needs you to be. Inert grey, never red. */}
              <polyline
                points={referencePoints}
                fill="none"
                stroke="var(--ink-faint)"
                strokeWidth={1.25}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />

              {/* What you actually finished. The one coloured mark on the chart. */}
              <polyline
                points={actualPoints}
                fill="none"
                stroke="var(--signal)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="h-px w-full bg-rule-strong" />
          </div>
        </div>

        <div
          className="type-condensed mt-1.5 flex items-baseline justify-between pl-9 text-[10.5px] text-ink-faint"
          aria-hidden
        >
          <span>{dayLabel(series.start)}</span>
          <span>{dayLabel(series.end)}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-rule pt-3 text-[12.5px] text-ink-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
        <span className="flex items-center gap-2">
          <span className="inline-block h-[2px] w-5 shrink-0 bg-signal" />
          completed
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-[2px] w-5 shrink-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, var(--ink-faint) 0 4px, transparent 4px 8px)',
            }}
          />
          pace to finish what is committed
        </span>
      </div>
    </section>
  );
}
