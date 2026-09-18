'use client';

/**
 * Activity heatmap — one cell per day, a rolling twelve months, most recent week
 * at the right.
 *
 * The spec attaches one hard condition to this panel existing at all: no streak
 * counter, no longest-run figure, no warning that anything is about to break. The
 * grid is a record of what happened. There is deliberately no code here that could
 * grow into one — nothing counts consecutive days, and an empty day is an empty
 * cell rather than a gap in something.
 *
 * Structurally it is the timeline's quieter twin, and deliberately built on the
 * same two columns: a caption gutter exactly `AXIS_ORIGIN` wide, then the data.
 * The rule between them is the same rule the timeline draws, at the same offset,
 * so the two panels read as one instrument rather than two charts.
 *
 * Presentational only: rows in, nothing out.
 */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { startOfUtcDay, targetDateIso } from '@/lib/career/horizon';
import type { Goal, Milestone, Task, Win } from '@/lib/db/schema';

import { AXIS_ORIGIN, AXIS_ORIGIN_CLASS } from '../Timeline/scale';
import {
  LEVEL_COLOURS,
  buildDayIndex,
  buildOverlayIndex,
  buildWeeks,
  longDayLabel,
  totalCompleted,
  weekIndexOfToday,
  type DayActivity,
  type HeatCell,
  type OverlayKey,
} from './buckets';

/* ------------------------------------------------------------------- props */

export type HeatmapProps = {
  tasks: readonly Task[];
  milestones: readonly Milestone[];
  /** Wins show in a day's detail. They never shade a cell — shading is task work. */
  wins?: readonly Win[];
  /** Needed only for the overlays and for naming a goal in the detail line. */
  goals?: readonly Goal[];

  /** Today, as a UTC-midnight date. Passed in so server and client agree. */
  today: Date;

  /** Admin tree passes true: it only changes where a cell links. */
  editable: boolean;

  /** Where a cell click lands. Defaults to the master table for the current tree. */
  tableHref?: string;
  goalHref?: (goalId: string) => string;

  /** All three overlays are off by default, per the spec. */
  initialOverlays?: Partial<Record<OverlayKey, boolean>>;

  className?: string;
};

const OVERLAY_LABELS: { key: OverlayKey; label: string }[] = [
  { key: 'milestones', label: 'Upcoming milestones' },
  { key: 'deadlines', label: 'Goal deadlines' },
  { key: 'completed', label: 'Goals completed' },
];

/** Columns of history. 53 covers a rolling twelve months. */
const HISTORY_WEEKS = 53;
/** What a narrow screen shows instead — 13 weeks keeps the cells tappable. */
const MOBILE_WEEKS = 13;

/** Height of the month-label strip, which the weekday gutter has to clear. */
const MONTH_ROW_H = 16;

const DAY_INITIALS = ['M', '', 'W', '', 'F', '', ''];

/** Stable empty defaults — a fresh `[]` in the signature would break every memo. */
const NO_WINS: readonly Win[] = [];
const NO_GOALS: readonly Goal[] = [];

/** Cells are 20px on a phone so they stay tappable, 11px once there is room for a year. */
const CELL = 'h-6 w-6 sm:h-[11px] sm:w-[11px]';
/** The weekday gutter matches only the cell *height*; its width is the shared origin. */
const CELL_ROW = 'h-6 sm:h-[11px]';

/* --------------------------------------------------------------- component */

export default function Heatmap({
  tasks,
  milestones,
  wins = NO_WINS,
  goals = NO_GOALS,
  today,
  editable,
  tableHref,
  goalHref,
  initialOverlays,
  className = '',
}: HeatmapProps) {
  const [overlays, setOverlays] = useState<Record<OverlayKey, boolean>>({
    milestones: initialOverlays?.milestones ?? false,
    deadlines: initialOverlays?.deadlines ?? false,
    completed: initialOverlays?.completed ?? false,
  });
  const [detail, setDetail] = useState<HeatCell | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const tree = editable ? '/career/admin' : '/career';
  const hrefForTable = tableHref ?? `${tree}/table`;
  const hrefForGoal = goalHref ?? ((id: string) => `${tree}/goal/${id}`);
  const day = useMemo(() => startOfUtcDay(today), [today]);

  const anyOverlay = overlays.milestones || overlays.deadlines || overlays.completed;

  const index = useMemo(
    () => buildDayIndex(tasks, milestones, wins),
    [tasks, milestones, wins],
  );

  const overlayIndex = useMemo(
    () =>
      buildOverlayIndex(
        goals.map((goal) => ({
          id: goal.id,
          title: goal.title,
          status: goal.status,
          closedOn: goal.closedOn,
          targetDate: targetDateIso(goal),
        })),
        milestones,
      ),
    [goals, milestones],
  );

  const weeks = useMemo(
    () => buildWeeks(day, index, { weeks: HISTORY_WEEKS, extendToQuarterEnd: anyOverlay }),
    [day, index, anyOverlay],
  );

  const total = useMemo(() => totalCompleted(weeks), [weeks]);
  const goalTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const goal of goals) map.set(goal.id, goal.title);
    return map;
  }, [goals]);

  // The most recent week belongs at the right edge, which means starting scrolled
  // to the end rather than at the beginning.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollLeft = element.scrollWidth;
  }, [weeks.length]);

  // Thirteen weeks of history on a narrow screen, counted back from today's column
  // rather than from the end of the array — with an overlay on, the array runs
  // forward to the end of the quarter and counting from the end would hide real days.
  const mobileCutoff = useMemo(
    () => Math.max(0, weekIndexOfToday(weeks, day) - MOBILE_WEEKS + 1),
    [weeks, day],
  );

  return (
    <section className={'relative ' + className} aria-label="Activity">
      {/* The same spine the timeline draws, at the same offset. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 top-0 z-10 hidden w-px bg-rule-strong lg:block"
        style={{ left: AXIS_ORIGIN }}
      />

      {/* header — the timeline's two columns again: caption, then controls */}
      <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-start md:gap-0">
        <div className={`flex-shrink-0 md:pr-5 ${AXIS_ORIGIN_CLASS}`}>
          <div>
            <h2 className="type-display text-[17px] leading-none text-ink">Activity</h2>
            <p className="type-readout mt-3 text-[34px] text-ink">{total}</p>
            <p className="mt-1.5 max-w-[26ch] text-[12px] leading-[1.35] text-ink-faint">
              tasks and milestones completed in the last 12 months
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:flex-1 md:justify-end">
          {OVERLAY_LABELS.map(({ key, label }) => {
            const active = overlays[key];
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setOverlays((previous) => ({ ...previous, [key]: !previous[key] }))}
                className={
                  'inline-flex h-11 items-center rounded-[5px] border px-3 text-[12.5px] transition-colors lg:h-9 ' +
                  (active
                    ? 'border-signal bg-signal-soft text-ink'
                    : 'border-rule-strong bg-surface text-ink-muted hover:text-ink')
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* body — weekday gutter, then the grid */}
      <div className="flex items-start border-t border-rule-strong pt-3">
        <div
          className={
            'type-condensed flex flex-shrink-0 flex-col gap-1 pr-2 text-right text-[10px] ' +
            'leading-none text-ink-faint sm:gap-[3px] md:pr-4 ' +
            AXIS_ORIGIN_CLASS
          }
          style={{ paddingTop: MONTH_ROW_H }}
        >
          {DAY_INITIALS.map((initial, row) => (
            <div
              key={row}
              className={'flex w-full items-center justify-end ' + CELL_ROW}
              aria-hidden={initial === ''}
            >
              {initial}
            </div>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-x-auto pb-1 md:pl-4"
        >
          <div className="flex gap-1 sm:gap-[3px]">
            {weeks.map((week, weekIndex) => (
              <div
                key={week.key}
                className={
                  'flex-col gap-1 sm:gap-[3px] ' +
                  // A phone drops to the last 13 weeks, by hiding columns rather
                  // than building a second grid — the month labels stay aligned.
                  (weekIndex < mobileCutoff ? 'hidden sm:flex' : 'flex')
                }
              >
                <div
                  className="type-condensed whitespace-nowrap text-[10px] text-ink-faint"
                  style={{ height: MONTH_ROW_H, lineHeight: `${MONTH_ROW_H}px` }}
                >
                  {week.monthLabel}
                </div>
                {week.cells.map((cell) => (
                  <Cell
                    key={cell.iso}
                    cell={cell}
                    href={`${hrefForTable}?date=${cell.iso}`}
                    upcoming={overlays.milestones ? overlayIndex.milestones.get(cell.iso) : undefined}
                    deadline={overlays.deadlines ? overlayIndex.deadlines.get(cell.iso) : undefined}
                    completed={overlays.completed ? overlayIndex.completed.get(cell.iso) : undefined}
                    onShow={setDetail}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* the day's detail — a strip rather than a floating card, so its links can
          actually be clicked and nothing is clipped by the scrolling grid */}
      <div className="mt-3 flex flex-col gap-3 border-t border-rule pt-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-h-[20px] min-w-0 flex-1">
          {detail ? (
            <DayDetail
              cell={detail}
              goalTitles={goalTitles}
              hrefForGoal={hrefForGoal}
              hrefForTable={hrefForTable}
              upcoming={overlays.milestones ? overlayIndex.milestones.get(detail.iso) : undefined}
              deadline={overlays.deadlines ? overlayIndex.deadlines.get(detail.iso) : undefined}
              completed={overlays.completed ? overlayIndex.completed.get(detail.iso) : undefined}
            />
          ) : (
            <p className="relative z-20 inline-block bg-ground pr-3 text-[12px] text-ink-faint">
              Hover a day to see what happened. Empty days are just empty.
            </p>
          )}
        </div>

        <div className="type-condensed flex flex-shrink-0 items-center gap-1.5 text-[11px] text-ink-faint">
          <span>Less</span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span
              key={level}
              className="h-[11px] w-[11px] rounded-[2px]"
              style={{ background: LEVEL_COLOURS[level] }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- cell */

function Cell({
  cell,
  href,
  upcoming,
  deadline,
  completed,
  onShow,
}: {
  cell: HeatCell;
  href: string;
  upcoming?: string[];
  deadline?: string[];
  completed?: string[];
  onShow: (cell: HeatCell) => void;
}) {
  const level = cell.activity?.level ?? 0;
  // A goal deadline outranks a milestone target on the same day: heavier ring wins.
  const ring = deadline?.length
    ? 'inset 0 0 0 2px var(--ink)'
    : upcoming?.length
      ? 'inset 0 0 0 1.5px var(--signal)'
      : undefined;

  const label = cellLabel(cell, upcoming, deadline, completed);

  const shared = {
    // A future day is drawn as an empty outline, never as a shade — past and
    // future must not read the same, and a filled grey future looks like a day
    // that happened and was blank.
    className:
      'relative block rounded-[2px] transition-colors duration-500 ' +
      'motion-reduce:transition-none ' +
      (cell.future ? 'border border-rule ' : '') +
      CELL,
    style: {
      background: cell.future ? 'transparent' : LEVEL_COLOURS[level],
      boxShadow: ring,
    },
    onMouseEnter: () => onShow(cell),
    onFocus: () => onShow(cell),
    title: label,
  };

  const corner = completed?.length ? (
    <span className="absolute right-[1px] top-[1px] h-[4px] w-[4px] rounded-full bg-ink" />
  ) : null;

  if (cell.future) {
    return (
      <span {...shared} tabIndex={ring ? 0 : -1} aria-label={label} role="img">
        {corner}
      </span>
    );
  }

  return (
    <Link href={href} prefetch={false} aria-label={label} {...shared}>
      {corner}
    </Link>
  );
}

function cellLabel(
  cell: HeatCell,
  upcoming?: string[],
  deadline?: string[],
  completed?: string[],
): string {
  const date = longDayLabel(cell.date);
  if (cell.future) {
    const due = [...(deadline ?? []), ...(upcoming ?? [])];
    return due.length > 0 ? `${date}, due: ${due.join(', ')}` : date;
  }
  const activity = cell.activity;
  const parts: string[] = [];
  if (activity?.tasks) parts.push(`${activity.tasks} ${activity.tasks === 1 ? 'task' : 'tasks'}`);
  if (activity?.milestones) {
    parts.push(`${activity.milestones} ${activity.milestones === 1 ? 'milestone' : 'milestones'}`);
  }
  if (activity?.wins) parts.push(`${activity.wins} ${activity.wins === 1 ? 'win' : 'wins'}`);
  if (completed?.length) parts.push(`${completed.length} goal completed`);
  return parts.length > 0 ? `${date}: ${parts.join(', ')}` : `${date}: nothing logged`;
}

/* ------------------------------------------------------------------ detail */

function DayDetail({
  cell,
  goalTitles,
  hrefForGoal,
  hrefForTable,
  upcoming,
  deadline,
  completed,
}: {
  cell: HeatCell;
  goalTitles: Map<string, string>;
  hrefForGoal: (goalId: string) => string;
  hrefForTable: string;
  upcoming?: string[];
  deadline?: string[];
  completed?: string[];
}) {
  const activity: DayActivity | null = cell.activity;
  const due = [...(deadline ?? []), ...(upcoming ?? [])];

  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
      <Link
        href={`${hrefForTable}?date=${cell.iso}`}
        className="type-condensed flex-shrink-0 text-[11.5px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
      >
        {longDayLabel(cell.date)}
      </Link>

      {cell.future ? (
        due.length > 0 ? (
          <span className="text-[12.5px] text-ink-muted">Due: {due.join(', ')}</span>
        ) : (
          <span className="text-[12.5px] text-ink-faint">Nothing scheduled.</span>
        )
      ) : activity && activity.entries.length > 0 ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
          {activity.entries.map((entry) => (
            <span key={`${entry.kind}:${entry.id}`} className="flex items-baseline gap-1.5">
              <span className="type-condensed text-[11px] text-ink-faint">{entry.kind}</span>
              {entry.goalId ? (
                <Link
                  href={hrefForGoal(entry.goalId)}
                  className="text-[12.5px] text-ink underline-offset-2 hover:text-signal hover:underline"
                  title={goalTitles.get(entry.goalId) ?? undefined}
                >
                  {entry.title}
                </Link>
              ) : (
                <span className="text-[12.5px] text-ink">{entry.title}</span>
              )}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-[12.5px] text-ink-faint">Nothing logged.</span>
      )}

      {completed?.length ? (
        <span className="text-[12.5px] text-signal">
          Goal completed: {completed.join(', ')}
        </span>
      ) : null}
    </div>
  );
}
