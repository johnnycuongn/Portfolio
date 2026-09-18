'use client';

/**
 * Goal detail — the gauge, and the two quiet aside readouts beside it.
 *
 * Spec, chart #1: "Percentage complete with a thin pace marker overlaid showing
 * where you *should* be by today's date. The gap between the fill and the marker
 * is the whole story, readable in half a second."
 *
 * So this is built as an instrument rather than a progress bar, and the gap is
 * drawn as an object in its own right:
 *
 *   - the **fill** is a solid block of signal, and it is the only coloured thing here;
 *   - the **marker** is a different *kind* of mark — a hairline in ink with a caret,
 *     running past both edges of the track, the way a gauge's index needle does. It
 *     is never a second fill, so it can never be mistaken for progress;
 *   - the **gap** between the two is hatched. Behind pace, the hatch sits on the empty
 *     track and reads as the chunk that is missing; ahead of pace it sits *on* the
 *     fill and reads as the chunk that is spare. Which side of the needle the texture
 *     falls on is the half-second read.
 *
 * Two rules are load-bearing:
 *
 *   - `paceBand === 'none'` means the goal has no horizon. Then there is no marker,
 *     no hatch, no pace line and no window readout — not a greyed-out version of
 *     them. A goal with no horizon is never late, which is the point of leaving the
 *     horizon off, and a grey needle still reads as a verdict.
 *   - Colour marks what is done. The accent appears only inside the fill. The one
 *     other colour on the screen is `overdue`, and it appears only when a real target
 *     date has genuinely passed — never for merely being slow.
 *
 * "Done is the loud number": `23` large, `of 31` small and muted. Never "8 remaining".
 */

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';

import { daysBetween, monthAbbr, parseIsoDate } from '@/lib/career/horizon';
import { percent, type GoalSummary } from '@/lib/career/rollup';
import type { HorizonSpec, IsoDate } from '@/lib/career/types';

/* --------------------------------------------------------------------- shapes */

/**
 * Everything this screen reads off a goal row. A `Goal` from `@/lib/db/schema`
 * satisfies it structurally, so the page passes the row straight through — and the
 * components stay importable without dragging drizzle into the client bundle.
 */
export type DetailGoal = HorizonSpec & {
  id: string;
  title: string;
  why: string;
  kind: string;
  status: string;
  competencyId: string;
  parentGoalId: string | null;
  startedOn: IsoDate | null;
  closedOn: IsoDate | null;
  closeNote: string | null;
  estHours: number | null;
  cost: number | null;
};

/** A closed horizon window, both ends inclusive, as ISO days. Null when there is no horizon. */
export type DetailWindow = { start: IsoDate; end: IsoDate } | null;

/* -------------------------------------------------------------------- helpers */

/** `2026-09-30` -> `30 Sep` (or `30 Sep 2026`). Null in, null out. */
function formatDay(iso: string | null | undefined, withYear = false): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  const day = `${date.getUTCDate()} ${monthAbbr(date.getUTCMonth() + 1)}`;
  return withYear ? `${day} ${date.getUTCFullYear()}` : day;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Keeps a label anchored to a point on the track from hanging off either end: it
 * centres over its anchor in the middle of the run and tucks flush at the extremes.
 */
function anchorShift(pct: number): string {
  if (pct <= 8) return '0%';
  if (pct >= 92) return '-100%';
  return '-50%';
}

/* ------------------------------------------------------------------ the gauge */

/**
 * Diagonal texture for the gap. Both variants are 1px rules on a 5px pitch — the
 * only difference is the ink, because one lies on the empty track and the other on
 * top of the fill. Built from custom properties, so both follow the theme.
 */
const HATCH_ON_TRACK =
  'repeating-linear-gradient(135deg, var(--ink-faint) 0 1px, transparent 1px 5px)';
const HATCH_ON_FILL =
  'repeating-linear-gradient(135deg, var(--ink-on-signal) 0 1px, transparent 1px 5px)';

type GaugeProps = {
  /** 0–1. How much of the work is done. */
  fraction: number;
  /** 0–1, or null for a goal with no horizon — then no needle and no hatch. */
  elapsed: number | null;
  /** Today, for the needle's label. */
  todayIso: IsoDate;
  label: string;
  /** The window's two ends, already formatted. Null on a goal with no horizon. */
  startLabel?: string | null;
  endLabel?: string | null;
};

function Gauge({ fraction, elapsed, todayIso, label, startLabel, endLabel }: GaugeProps) {
  // motion/react writes the width as an inline style, which the global
  // prefers-reduced-motion override in theme.css cannot cancel — that rule only
  // reaches CSS animations and transitions. So the branch has to happen here, and
  // when motion is reduced the fill is simply drawn at its final width.
  const reduceMotion = useReducedMotion();
  const pct = percent(fraction);
  const needle = elapsed === null ? null : percent(elapsed);
  const ahead = needle !== null && pct >= needle;

  // The hatched span always runs between the fill's edge and the needle, whichever
  // way round they are. Under ~1% it is not a readable object, so it is dropped
  // rather than drawn as a sliver.
  const gapLow = needle === null ? 0 : Math.min(pct, needle);
  const gapWidth = needle === null ? 0 : Math.abs(pct - needle);
  const showGap = gapWidth >= 1;

  return (
    <div className="w-full">
      {needle !== null ? (
        <div className="relative mb-2.5 h-[14px]">
          <span
            className="type-condensed absolute top-0 whitespace-nowrap text-[11px] text-ink-muted"
            style={{ left: `${needle}%`, transform: `translateX(${anchorShift(needle)})` }}
          >
            Today {formatDay(todayIso)}
          </span>
        </div>
      ) : null}

      <div
        className="relative h-9 rounded-[2px] bg-track sm:h-11"
        role="img"
        aria-label={label}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-[2px] bg-signal"
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: [0.2, 0.7, 0.3, 1] }}
        />

        {showGap ? (
          <span
            aria-hidden
            className="absolute inset-y-0"
            style={{
              left: `${gapLow}%`,
              width: `${gapWidth}%`,
              backgroundImage: ahead ? HATCH_ON_FILL : HATCH_ON_TRACK,
              opacity: ahead ? 0.5 : 0.75,
            }}
          />
        ) : null}

        {/* The pace marker. Deliberately a different *kind* of mark from the fill:
            a hairline index in ink, clamped top and bottom by a caret, overshooting
            both edges of the track. Nothing about it is a coloured block, so it can
            never be misread as more fill — the gap between it and the fill's edge is
            the reading, and the two carets are what let you find that edge in half a
            second without tracing a 1px line. Centred on its own value rather than
            hung off it, so the needle sits exactly where the percentage says. */}
        {needle === null ? null : (
          <span
            aria-hidden
            className="absolute bottom-[-7px] top-[-7px] w-px -translate-x-1/2 bg-ink"
            style={{ left: `${needle}%` }}
          >
            <span className="absolute -top-px left-1/2 block -translate-x-1/2 border-x-[3.5px] border-t-[5px] border-x-transparent border-t-ink" />
            <span className="absolute -bottom-px left-1/2 block -translate-x-1/2 border-x-[3.5px] border-b-[5px] border-x-transparent border-b-ink" />
          </span>
        )}

      </div>

      {/* The scale. The figure labels the *fill*, so it is anchored under the fill's
          edge rather than parked at one end of the track, where it would read as a
          label for the track. Nothing is ever set on top of the fill: `ink-on-signal`
          only clears 3:1 against the fluorescent pink in riso, which is fine for the
          checkbox tick and not fine for a number you have to read. A window end is
          dropped when the figure has walked into it. */}
      <div className="type-condensed relative mt-2.5 h-[15px] text-[11px]">
        {startLabel && pct >= 18 ? (
          <span className="absolute left-0 top-0 text-ink-faint">{startLabel}</span>
        ) : null}
        {endLabel && pct <= 82 ? (
          <span className="absolute right-0 top-0 text-ink-faint">{endLabel}</span>
        ) : null}
        <span
          className="absolute top-0 text-[11.5px] text-ink"
          style={{ left: `${pct}%`, transform: `translateX(${anchorShift(pct)})` }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- progress block */

export type ProgressBlockProps = {
  summary: GoalSummary;
  window: DetailWindow;
  /** Today as an ISO day, resolved on the server so the server and client agree. */
  todayIso: IsoDate;
  /** Child goals rolled into this bar, per the spec's parent rollup. Usually 0. */
  childCount?: number;
  editable: boolean;
  /** Editing affordances, injected by the agent that owns mutations. */
  actions?: ReactNode;
};

export default function ProgressBlock({
  summary,
  window,
  todayIso,
  childCount = 0,
  editable,
  actions,
}: ProgressBlockProps) {
  const { progress, milestones, elapsed, pace, paceBand, pastTarget } = summary;
  const paced = paceBand !== 'none' && pace !== null;
  const complete = progress.totalCount > 0 && progress.fraction >= 1;

  const end = parseIsoDate(window?.end ?? null);
  const today = parseIsoDate(todayIso);
  const daysLeft = end && today ? daysBetween(today, end) : null;

  // The pace phrase. Points, not a percentage of a percentage — the number is the
  // size of the gap you can see, so it should read as the same object.
  let paceLine: string | null = null;
  if (paced) {
    const points = Math.abs(Math.round(pace * 100));
    if (pastTarget && !complete) {
      paceLine = `${plural(points, 'point', 'points')} behind, and the target date has passed`;
    } else if (pace >= 0) {
      paceLine = points === 0 ? 'Exactly on pace' : `${plural(points, 'point', 'points')} ahead of pace`;
    } else {
      paceLine = `${plural(points, 'point', 'points')} behind pace`;
    }
  }
  // `overdue` is the one alarm colour in the app and it is spent only on a real date
  // that has really passed. Merely slow is never red.
  const paceTone = pastTarget && !complete ? 'text-overdue' : 'text-ink';

  let windowLine: string;
  if (!window || daysLeft === null) {
    windowLine = 'No horizon, so no pace. Progress only, and this goal is never late.';
  } else if (daysLeft > 0) {
    windowLine = `${plural(daysLeft, 'day', 'days')} left in the window`;
  } else if (daysLeft === 0) {
    windowLine = 'The window closes today';
  } else {
    windowLine = `The window closed ${plural(-daysLeft, 'day', 'days')} ago`;
  }

  return (
    <section aria-label="Progress" className="flex w-full min-w-0 flex-col">
      <div className="flex flex-wrap items-end gap-x-9 gap-y-4">
        <p className="m-0 flex items-baseline gap-2.5">
          <span
            className={`type-readout text-[58px] text-ink sm:text-[76px] ${complete ? 'riso-register' : ''}`}
          >
            {progress.doneCount}
          </span>
          <span className="text-[14px] text-ink-muted">of {progress.totalCount} tasks done</span>
        </p>

        {milestones.total > 0 ? (
          <p className="m-0 flex items-baseline gap-2 pb-1.5">
            <span className="type-readout text-[26px] text-ink sm:text-[30px]">
              {milestones.done}
            </span>
            <span className="text-[13px] text-ink-muted">of {milestones.total} milestones</span>
          </p>
        ) : null}
      </div>

      <div className="mt-7 sm:mt-8">
        <Gauge
          fraction={progress.fraction}
          elapsed={elapsed}
          todayIso={todayIso}
          label={
            paced
              ? `${percent(progress.fraction)} percent done, against ${percent(elapsed ?? 0)} percent of the window elapsed`
              : `${percent(progress.fraction)} percent done`
          }
          startLabel={window ? formatDay(window.start, true) : null}
          endLabel={window ? formatDay(window.end, true) : null}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 border-t border-rule pt-3 text-[13px] leading-[1.5]">
        {paceLine ? <span className={paceTone}>{paceLine}</span> : null}
        <span className="text-ink-muted">{windowLine}</span>
        {childCount > 0 ? (
          <span className="text-ink-muted">
            Includes {plural(childCount, 'child goal', 'child goals')}
          </span>
        ) : null}
      </div>

      {editable && actions ? <div className="mt-4">{actions}</div> : null}
    </section>
  );
}

/* ---------------------------------------------------------------- goal facts */

export type GoalFactsProps = {
  goal: DetailGoal;
  parent: { id: string; title: string } | null;
  competencyName: string;
  targetDate: IsoDate | null;
  /** `/career` or `/career/admin` — keeps the parent link inside the tree you are in. */
  basePath: string;
  editable: boolean;
  actions?: ReactNode;
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="type-condensed shrink-0 text-[12px] text-ink-faint">{label}</dt>
      <dd className="m-0 min-w-0 text-right text-[13px] text-ink">{children}</dd>
    </div>
  );
}

/**
 * The stored facts, as a ruled list rather than a panel. Horizon and competency are
 * deliberately absent: they are on the masthead, and a fact worth reading twice on
 * one screen is a fact that has been put in the wrong place once.
 */
export function GoalFacts({
  goal,
  parent,
  targetDate,
  basePath,
  editable,
  actions,
}: GoalFactsProps) {
  return (
    <div>
      <h2 className="type-condensed m-0 border-b border-rule-strong pb-2 text-[13.5px] text-ink-muted">
        Details
      </h2>
      <dl className="m-0 divide-y divide-rule">
        <Fact label="Target date">{formatDay(targetDate, true) ?? 'None'}</Fact>
        {parent ? (
          <Fact label="Rolls up into">
            <Link
              href={`${basePath}/goal/${parent.id}`}
              className="text-signal underline-offset-4 hover:underline"
            >
              {parent.title}
            </Link>
          </Fact>
        ) : null}
        {goal.startedOn ? <Fact label="Started">{formatDay(goal.startedOn, true)}</Fact> : null}
        {goal.estHours !== null ? <Fact label="Estimated">{goal.estHours}h</Fact> : null}
        {goal.cost !== null ? <Fact label="Cost">${goal.cost}</Fact> : null}
        {goal.closedOn ? (
          <Fact label={goal.status === 'dropped' ? 'Dropped' : 'Closed'}>
            {formatDay(goal.closedOn, true)}
          </Fact>
        ) : null}
      </dl>
      {editable && actions ? <div className="mt-4">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- window panel */

export type WindowPanelProps = {
  summary: GoalSummary;
  window: NonNullable<DetailWindow>;
  todayIso: IsoDate;
};

/**
 * The window, as time rather than as progress. It deliberately does *not* redraw the
 * gauge — the gauge above already carries the fill, the needle and the two dates, and
 * a second copy of a chart is how a screen stops having a hero. What is left here is
 * the one thing the gauge does not say in words: how much clock is left.
 *
 * Rendered only when a horizon exists, so there is no "no horizon" variant of this
 * to mis-read.
 */
export function WindowPanel({ summary, window, todayIso }: WindowPanelProps) {
  const end = parseIsoDate(window.end);
  const today = parseIsoDate(todayIso);
  const daysLeft = end && today ? daysBetween(today, end) : null;
  const over = daysLeft !== null && daysLeft < 0;
  const elapsedPct = percent(summary.elapsed ?? 0);

  return (
    <div>
      <h2 className="type-condensed m-0 border-b border-rule-strong pb-2 text-[13.5px] text-ink-muted">
        Window
      </h2>

      {daysLeft === null ? null : (
        <p className="m-0 flex items-baseline gap-2.5 pt-4">
          <span className="type-readout text-[34px] text-ink">{Math.abs(daysLeft)}</span>
          <span className="text-[13px] text-ink-muted">
            {over
              ? `${daysLeft === -1 ? 'day' : 'days'} since it closed`
              : `${daysLeft === 1 ? 'day' : 'days'} left`}
          </span>
        </p>
      )}

      <dl className="m-0 mt-3 divide-y divide-rule">
        <Fact label="Opened">{formatDay(window.start, true)}</Fact>
        <Fact label="Closes">{formatDay(window.end, true)}</Fact>
        <Fact label="Elapsed">{elapsedPct}%</Fact>
      </dl>
    </div>
  );
}

export { formatDay as formatDetailDay };
