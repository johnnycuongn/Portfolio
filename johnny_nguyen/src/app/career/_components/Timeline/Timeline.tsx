'use client';

/**
 * Timeline — the hero of the dashboard.
 *
 * Horizontal is time, vertical is the goal list, and both scroll inside the panel
 * rather than moving the page. The one idea the whole component exists to serve:
 * a bar's *length* is its time window and its *fill* is its progress, drawn as the
 * same object, so a half-drawn bar on a three-quarters-elapsed window looks wrong
 * before you have read a single number.
 *
 * It is not a card. It is a ruled measuring surface sitting on the page ground:
 * a label rail on the left, the time axis across the top, faint month rules
 * dropping the full height of the grid, and a today-line cutting across the bars.
 * That structure is what carries the hierarchy — there is no box drawn around it,
 * because a box would put it on the same footing as the collapsed backlog line.
 *
 * The vertical rule at `AXIS_ORIGIN` — where names stop and time starts — is shared
 * with the heatmap below, which uses the same measurement for its caption gutter.
 * One spine down both panels, not two that nearly agree.
 *
 * Presentational only. No fetching, no mutations — the dashboard passes rows in.
 */

import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  horizonLabel as horizonLabelOf,
  horizonWindow,
  parseIsoDate,
  startOfUtcDay,
  targetDate,
} from '@/lib/career/horizon';
import { goalSummary, milestoneProgress, percent as toPercent } from '@/lib/career/rollup';
import type { GoalSummary } from '@/lib/career/rollup';
import type { Goal, Milestone, Task } from '@/lib/db/schema';

import {
  AXIS_ORIGIN,
  AXIS_ORIGIN_CLASS,
  ZOOM_LABELS,
  ZOOM_WINDOW_DAYS,
  TIMELINE_ZOOMS,
  axisTicks,
  barGeometry,
  dateAtPx,
  dueSoon,
  milestoneSpans,
  offsetPx,
  rangeDays,
  rangeLabel,
  timelineDomain,
  type BarGeometry,
  type DayRange,
  type TimelineZoom,
} from './scale';
import type { BarSegment, BarTone, TimelineProps, TimelineRow } from './types';

/* ------------------------------------------------------------------ metrics */

const AXIS_H = 34;
const GROUP_ROW_H = 28;
const GOAL_ROW_H = 32;
const MILESTONE_ROW_H = 22;

/**
 * Below this the percentage would be clipped inside the bar, so it steps outside.
 * It also steps outside once the fill has run past where the number sits: keeping
 * the figure on the quiet track instead of on the signal fill means one text
 * colour that clears 4.5:1 in all six themes, rather than a light-on-accent
 * figure that is legible in four of them.
 */
const PCT_INSIDE_MIN_W = 60;
const PCT_INSIDE_MAX_FILL = 78;

/** Paused work is drawn quieter, not differently coloured — it is not a failure state. */
const FILL_CLASS: Record<BarTone, string> = {
  active: 'bg-signal',
  paused: 'bg-signal',
  done: 'bg-signal',
  'past-due': 'bg-overdue',
};

const FILL_OPACITY: Record<BarTone, number> = {
  active: 1,
  // Finished work stops competing for attention; it is coloured, not bold.
  done: 0.62,
  paused: 0.4,
  'past-due': 1,
};

const GROUPS: { key: string; label: string; horizonType: string }[] = [
  { key: 'yearly', label: 'Yearly', horizonType: 'yearly' },
  { key: 'quarterly', label: 'Quarterly', horizonType: 'quarterly' },
  { key: 'monthly', label: 'Monthly', horizonType: 'monthly' },
  { key: 'custom', label: 'Custom', horizonType: 'custom' },
];

/* --------------------------------------------------------------- small parts */

/**
 * A toggle reads "on" from a tinted ground and a signal-coloured rule, not from a
 * solid accent fill: small text sitting on a saturated accent is the one place the
 * two-ink theme drops below 4.5:1, and a quieter on-state suits a control strip
 * that is not the thing you came to look at.
 */
const CONTROL_BASE =
  'inline-flex h-11 items-center rounded-[5px] border px-3 text-[12.5px] ' +
  'transition-colors lg:h-9';

function on(active: boolean): string {
  return active
    ? 'border-signal bg-signal-soft text-ink'
    : 'border-rule-strong bg-surface text-ink-muted hover:text-ink';
}

function ToggleButton({
  active,
  children,
  onClick,
  title,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`${CONTROL_BASE} ${on(active)}`}
    >
      {children}
    </button>
  );
}

/** Task segments inside a bar: one per task, filled when done, hollow when not. */
function Segments({ segments, tone }: { segments: BarSegment[]; tone: BarTone }) {
  return (
    <div className="absolute inset-0 flex gap-[2px] p-[2px]">
      {segments.map((segment) => (
        <div
          key={segment.key}
          title={segment.title}
          className={
            'min-w-[2px] flex-1 rounded-[2px] border ' +
            (segment.filled
              ? `${FILL_CLASS[tone]} border-transparent`
              : 'border-rule-strong bg-transparent')
          }
          style={segment.filled ? { opacity: FILL_OPACITY[tone] } : undefined}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ component */

export default function Timeline({
  goals,
  milestones,
  tasks,
  today,
  editable,
  summaries,
  rollupOptions,
  initialZoom = 'quarter',
  initialLayers,
  tableHref,
  goalHref,
  className = '',
}: TimelineProps) {
  const [zoom, setZoom] = useState<TimelineZoom>(initialZoom);
  const [showMilestones, setShowMilestones] = useState(initialLayers?.milestones ?? true);
  const [showTasks, setShowTasks] = useState(initialLayers?.tasks ?? false);
  const [railOpen, setRailOpen] = useState(false);
  const [viewport, setViewport] = useState(0);
  const [axisLabel, setAxisLabel] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const centredRef = useRef(false);
  const reduceMotion = useReducedMotion();

  const tree = editable ? '/career/admin' : '/career';
  const hrefForGoal = goalHref ?? ((id: string) => `${tree}/goal/${id}`);
  const hrefForTable = tableHref ?? `${tree}/table`;
  const day = useMemo(() => startOfUtcDay(today), [today]);

  /* ------------------------------------------------------------ derived data */

  const placed = useMemo(() => {
    const rows: { goal: Goal; window: DayRange }[] = [];
    for (const goal of goals) {
      // Dropped goals are archived, not deleted — they live in the master table,
      // not on a chart of what is in flight.
      if (goal.status === 'dropped') continue;
      const window = horizonWindow(goal);
      if (!window) continue;
      rows.push({ goal, window });
    }
    return rows;
  }, [goals]);

  const withoutHorizon = useMemo(
    () => goals.filter((g) => g.status !== 'dropped' && !horizonWindow(g)).length,
    [goals],
  );

  const summaryFor = useCallback(
    (goal: Goal): GoalSummary =>
      summaries?.[goal.id] ??
      goalSummary(goal, goals, milestones, tasks, day, rollupOptions),
    [summaries, goals, milestones, tasks, day, rollupOptions],
  );

  const milestonesByGoal = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    for (const milestone of milestones) {
      const list = map.get(milestone.goalId);
      if (list) list.push(milestone);
      else map.set(milestone.goalId, [milestone]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    }
    return map;
  }, [milestones]);

  const tasksByMilestone = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.milestoneId) continue;
      const list = map.get(task.milestoneId);
      if (list) list.push(task);
      else map.set(task.milestoneId, [task]);
    }
    return map;
  }, [tasks]);

  const tasksByGoal = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const list = map.get(task.goalId);
      if (list) list.push(task);
      else map.set(task.goalId, [task]);
    }
    return map;
  }, [tasks]);

  /**
   * Done first, then in flight, then untouched. The segments are a bar, not a
   * schedule — reading them left to right should say "four in, two to go", which
   * a shuffled order destroys.
   */
  const segmentsOf = useCallback((list: readonly Task[] | undefined): BarSegment[] | null => {
    if (!list || list.length === 0) return null;
    const rank = (task: Task) => (task.status === 'done' ? 0 : task.status === 'doing' ? 1 : 2);
    return [...list]
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
      .map((task) => ({
        key: task.id,
        filled: task.status === 'done',
        title: `${task.title} (${task.status})`,
      }));
  }, []);

  const rows = useMemo(() => {
    const out: TimelineRow[] = [];

    for (const group of GROUPS) {
      const inGroup = placed
        .filter((row) => row.goal.horizonType === group.horizonType)
        .sort(
          (a, b) =>
            a.window.start.getTime() - b.window.start.getTime() ||
            a.goal.title.localeCompare(b.goal.title),
        );
      if (inGroup.length === 0) continue;

      out.push({
        kind: 'group',
        key: `group:${group.key}`,
        label: group.label,
        count: inGroup.length,
      });

      for (const { goal, window } of inGroup) {
        const summary = summaryFor(goal);
        const goalMilestones = milestonesByGoal.get(goal.id) ?? [];
        const tone: BarTone =
          goal.status === 'done'
            ? 'done'
            : goal.status === 'paused'
              ? 'paused'
              : // `pastTarget` is true only when a real target date exists and has
                // passed — a goal with no date is never drawn as late.
                summary.pastTarget && summary.progress.fraction < 1
                ? 'past-due'
                : 'active';

        // Tasks subdivide the goal's own bar when there are no milestone rows to
        // carry them — either the goal has none, or the layer is switched off.
        // Never both, or the same task would be drawn twice.
        const ownSegments =
          showTasks && (goalMilestones.length === 0 || !showMilestones)
            ? segmentsOf(tasksByGoal.get(goal.id))
            : null;

        out.push({
          kind: 'goal',
          key: `goal:${goal.id}`,
          goal,
          summary,
          tone,
          percent: toPercent(summary.progress.fraction),
          window,
          horizonLabel: horizonLabelOf(goal),
          segments: ownSegments,
          // Dated milestones keep a tick on the parent bar even with the layer off,
          // so collapsing the rows never loses a real date.
          ticks: goalMilestones
            .map((milestone) => ({
              key: milestone.id,
              date: parseIsoDate(milestone.targetDate),
              title: milestone.title,
            }))
            .filter((tick): tick is { key: string; date: Date; title: string } =>
              Boolean(tick.date),
            ),
        });

        if (!showMilestones || goalMilestones.length === 0) continue;

        const spans = milestoneSpans(window, goalMilestones);
        for (const milestone of goalMilestones) {
          const span = spans.get(milestone.id);
          if (!span) continue;
          const progress = milestoneProgress(milestone.id, tasks, rollupOptions);
          const complete = milestone.status === 'done';
          out.push({
            kind: 'milestone',
            key: `milestone:${milestone.id}`,
            milestone,
            goalId: goal.id,
            percent: complete ? 100 : toPercent(progress.fraction),
            complete,
            window: span,
            segments: showTasks ? segmentsOf(tasksByMilestone.get(milestone.id)) : null,
            taskLabel:
              progress.totalCount > 0
                ? `${progress.doneCount} of ${progress.totalCount} tasks`
                : 'no tasks yet',
          });
        }
      }
    }

    return out;
  }, [
    placed,
    summaryFor,
    milestonesByGoal,
    tasksByGoal,
    tasksByMilestone,
    tasks,
    rollupOptions,
    segmentsOf,
    showMilestones,
    showTasks,
  ]);

  const domain = useMemo(
    () => timelineDomain(placed.map((row) => row.window), day),
    [placed, day],
  );

  const rail = useMemo(
    () =>
      dueSoon(
        {
          goals: placed
            .filter(({ goal }) => goal.status !== 'done')
            .map(({ goal }) => ({
              id: goal.id,
              title: goal.title,
              horizonLabel: horizonLabelOf(goal),
              targetDate: targetDate(goal),
            })),
          milestones: milestones
            .filter((milestone) => milestone.status !== 'done')
            .map((milestone) => ({
              id: milestone.id,
              goalId: milestone.goalId,
              goalTitle: goals.find((g) => g.id === milestone.goalId)?.title ?? 'Goal',
              title: milestone.title,
              targetDate: milestone.targetDate,
            })),
        },
        day,
      ),
    [placed, milestones, goals, day],
  );

  /* ----------------------------------------------------------- measure/scroll */

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    setViewport(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setViewport(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const timeWidth = Math.max(320, viewport - AXIS_ORIGIN);
  const pxPerDay = timeWidth / ZOOM_WINDOW_DAYS[zoom];
  const contentWidth = useMemo(
    () => Math.max(timeWidth, rangeDays(domain) * pxPerDay),
    [domain, pxPerDay, timeWidth],
  );
  const todayPx = offsetPx(domain, day, pxPerDay);

  const centreOnToday = useCallback(
    (smooth: boolean) => {
      const element = scrollRef.current;
      if (!element) return;
      const visible = Math.max(1, element.clientWidth - AXIS_ORIGIN);
      // Today sits a third in, which is the spec's "previous month through the
      // next four" at quarter zoom without hardcoding a date range.
      const left = Math.max(0, offsetPx(domain, day, pxPerDay) - visible * 0.3);
      element.scrollTo({ left, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    },
    [domain, day, pxPerDay, reduceMotion],
  );

  // Re-centre on the first real measurement and whenever the zoom changes; never
  // afterwards, or a scroll would be yanked back under the reader.
  const measured = viewport > 0;
  useEffect(() => {
    if (!measured) return;
    centreOnToday(centredRef.current);
    centredRef.current = true;
    // centreOnToday is deliberately out of the deps: it changes with every resize,
    // and re-running this on resize would fight the reader's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, measured]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => {
      const visible = Math.max(1, element.clientWidth - AXIS_ORIGIN);
      const start = dateAtPx(domain, element.scrollLeft, pxPerDay);
      const end = dateAtPx(domain, element.scrollLeft + visible, pxPerDay);
      const label = rangeLabel(start, end);
      setAxisLabel((previous) => (previous === label ? previous : label));
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    return () => element.removeEventListener('scroll', update);
  }, [domain, pxPerDay]);

  const ticks = useMemo(() => axisTicks(domain, zoom, pxPerDay), [domain, zoom, pxPerDay]);

  const fillTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.5, ease: [0.2, 0.7, 0.3, 1] as const };

  /* -------------------------------------------------------------------- bars */

  const renderBar = (row: Extract<TimelineRow, { kind: 'goal' | 'milestone' }>) => {
    const geometry: BarGeometry | null = barGeometry(domain, row.window, pxPerDay);
    if (!geometry) return null;

    const isGoal = row.kind === 'goal';
    // Milestone segments stay signal even once the milestone is closed — the
    // softened fill is the goal-level "this is finished" signal, and repeating it
    // on every child bar would drain the colour out of the row that earned it.
    const tone: BarTone = isGoal ? row.tone : 'active';
    const inside =
      geometry.width >= PCT_INSIDE_MIN_W && row.percent <= PCT_INSIDE_MAX_FILL;
    const height = isGoal ? 16 : 8;
    const top = isGoal ? 8 : 7;

    return (
      <>
        <div
          className="absolute overflow-hidden rounded-[3px] bg-track"
          style={{ left: geometry.left, width: geometry.width, top, height }}
        >
          {row.segments ? (
            <Segments segments={row.segments} tone={tone} />
          ) : (
            <motion.div
              className={'h-full rounded-[3px] ' + FILL_CLASS[tone]}
              initial={false}
              animate={{ width: `${row.percent}%` }}
              transition={fillTransition}
              style={{
                opacity: isGoal
                  ? FILL_OPACITY[tone]
                  : row.complete
                    ? FILL_OPACITY.done
                    : FILL_OPACITY.active,
              }}
            />
          )}

          {isGoal && !showMilestones
            ? row.ticks.map((tick) => {
                const left = offsetPx(domain, tick.date, pxPerDay) - geometry.left;
                if (left < 0 || left > geometry.width) return null;
                return (
                  <span
                    key={tick.key}
                    title={`Milestone: ${tick.title}`}
                    className="absolute top-0 h-full w-px bg-ink"
                    style={{ left }}
                  />
                );
              })
            : null}

          {isGoal && inside ? (
            <span className="type-condensed absolute bottom-0 right-[5px] text-[10px] leading-4 text-ink-muted">
              {row.percent}%
            </span>
          ) : null}
        </div>

        {isGoal && !inside ? (
          <span
            className="type-condensed absolute top-[9px] text-[10px] leading-4 text-ink-muted"
            style={{ left: geometry.left + geometry.width + 5 }}
          >
            {row.percent}%
          </span>
        ) : null}

        {!isGoal ? (
          <span
            className="type-condensed pointer-events-none absolute top-[4px] text-[10px] leading-4 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: geometry.left + geometry.width + 5 }}
          >
            {row.percent}%
          </span>
        ) : null}
      </>
    );
  };

  /* ------------------------------------------------------------------ render */

  const rowWidth = AXIS_ORIGIN + contentWidth;
  const placedCount = placed.length;

  return (
    <section
      className={
        // No card. The grid sits on the page ground and the axis, the rules and
        // the bars do the structural work.
        //
        // Height is content-driven up to a cap rather than fixed: the spec asks
        // for a timeline tall enough to fill the viewport, but a fixed 700px of
        // ruled emptiness under two goals is how a tracker gets abandoned in week
        // one. The cap lives on the scroller below, so a long list still scrolls
        // inside the panel instead of pushing the page around.
        'relative flex flex-col ' + className
      }
      aria-label="Timeline"
    >
      {/* The spine: where names stop and time starts. The heatmap below sets its
          caption gutter to the same width, so this is one line down both panels. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 top-0 z-10 hidden w-px bg-rule-strong lg:block"
        style={{ left: AXIS_ORIGIN }}
      />

      {/* header — laid out on the same two columns as the grid beneath it */}
      <div className="flex flex-col gap-3 pb-3 md:flex-row md:items-end md:gap-0">
        <div className={`flex-shrink-0 md:pr-5 ${AXIS_ORIGIN_CLASS}`}>
          <div>
            <h2 className="type-display text-[20px] leading-none text-ink sm:text-[24px]">Timeline</h2>
            <p className="type-condensed mt-1.5 text-[11.5px] leading-none text-ink-faint">
              {placedCount === 0
                ? 'No goals with a horizon'
                : `${placedCount} ${placedCount === 1 ? 'goal' : 'goals'} with a horizon`}
            </p>
          </div>
        </div>

        <div className="hidden flex-1 flex-wrap items-center justify-end gap-2 md:flex">
          <ToggleButton active={showMilestones} onClick={() => setShowMilestones((v) => !v)}>
            Milestones
          </ToggleButton>
          <ToggleButton
            active={showTasks}
            onClick={() => setShowTasks((v) => !v)}
            title="Subdivide each bar into one segment per task"
          >
            Tasks
          </ToggleButton>

          <div
            className="flex h-11 overflow-hidden rounded-[5px] border border-rule-strong lg:h-9"
            role="group"
            aria-label="Zoom"
          >
            {TIMELINE_ZOOMS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setZoom(level)}
                aria-pressed={zoom === level}
                className={
                  'border-r border-rule-strong px-3.5 text-[12.5px] transition-colors last:border-r-0 ' +
                  (zoom === level
                    ? 'bg-signal-soft text-ink'
                    : 'bg-surface text-ink-muted hover:text-ink')
                }
              >
                {ZOOM_LABELS[level]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => centreOnToday(true)}
            className={`${CONTROL_BASE} border-rule-strong bg-surface text-ink-muted hover:text-ink`}
          >
            Today
          </button>

          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            aria-expanded={railOpen}
            className={`${CONTROL_BASE} gap-2 ${on(railOpen)}`}
          >
            Due in 30 days
            <span className="type-condensed rounded-[3px] bg-surface-2 px-[6px] py-px text-[11.5px] text-ink-muted">
              {rail.length}
            </span>
          </button>
        </div>
      </div>

      {/* desktop grid */}
      <div className="relative hidden overflow-hidden lg:block">
        <div
          ref={scrollRef}
          className="overflow-auto lg:max-h-[min(660px,calc(100vh-220px))]"
        >
          <div className="relative" style={{ width: rowWidth }}>
            {/* axis */}
            <div
              className="sticky top-0 z-30 flex border-b border-rule-strong bg-ground"
              style={{ height: AXIS_H }}
            >
              <div
                className="type-condensed sticky left-0 z-40 flex flex-shrink-0 items-end bg-ground pb-1.5 pr-4 text-[11.5px] text-ink-muted"
                style={{ width: AXIS_ORIGIN }}
              >
                {axisLabel}
              </div>
              <div className="relative flex-1">
                {ticks.map((tick) => (
                  <div
                    key={tick.key}
                    className={
                      'absolute bottom-0 top-0 border-l ' +
                      (tick.major ? 'border-rule-strong' : 'border-rule')
                    }
                    style={{ left: tick.left }}
                  >
                    <span
                      className={
                        'type-condensed whitespace-nowrap pl-1.5 text-[11px] ' +
                        (tick.major ? 'text-ink-muted' : 'text-ink-faint')
                      }
                      style={{ lineHeight: `${AXIS_H}px` }}
                    >
                      {tick.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* the ruled surface: every axis tick drops the full height of the grid */}
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 z-0"
              style={{ left: AXIS_ORIGIN, right: 0, top: AXIS_H }}
            >
              {ticks.map((tick) => (
                <span
                  key={tick.key}
                  // Every tick drops the same faint rule; the axis row above marks
                  // the majors with a heavier stroke. (Deliberately not an opacity
                  // modifier — `bg-rule/60` resolves to transparent against these
                  // `var()`-valued tokens under Tailwind 3, so the line vanishes.)
                  className="absolute bottom-0 top-0 w-px bg-rule"
                  style={{ left: tick.left }}
                />
              ))}
            </div>

            {/* today */}
            <div
              className="pointer-events-none absolute bottom-0 z-[5] w-px bg-ink-faint"
              style={{ left: AXIS_ORIGIN + todayPx, top: AXIS_H }}
            />
            <div
              className="pointer-events-none absolute z-40 h-[7px] w-[3px] -translate-x-[1px] bg-ink"
              style={{ left: AXIS_ORIGIN + todayPx, top: AXIS_H - 7 }}
              title="Today"
            />

            {/* rows */}
            {rows.map((row) => {
              if (row.kind === 'group') {
                return (
                  <div
                    key={row.key}
                    className="sticky z-20 flex items-end border-b border-rule bg-ground pb-1"
                    style={{ height: GROUP_ROW_H, top: AXIS_H, width: rowWidth }}
                  >
                    <div
                      className="sticky left-0 z-10 flex flex-shrink-0 items-baseline gap-2 bg-ground pr-4"
                      style={{ width: AXIS_ORIGIN }}
                    >
                      <span className="type-display text-[12px] text-ink-muted">{row.label}</span>
                      <span className="type-condensed text-[11px] text-ink-faint">
                        {row.count}
                      </span>
                    </div>
                  </div>
                );
              }

              if (row.kind === 'goal') {
                return (
                  <div
                    key={row.key}
                    className="group relative flex items-center border-b border-rule"
                    style={{ height: GOAL_ROW_H, width: rowWidth }}
                  >
                    <div
                      className="sticky left-0 z-10 flex flex-shrink-0 items-center gap-2 bg-ground pr-4 group-hover:bg-surface-2"
                      style={{ width: AXIS_ORIGIN }}
                    >
                      <Link
                        href={hrefForGoal(row.goal.id)}
                        className="truncate text-[13px] text-ink no-underline hover:text-signal"
                        title={row.goal.title}
                      >
                        {row.goal.title}
                      </Link>
                      <span className="type-condensed flex-shrink-0 rounded-[3px] bg-surface-2 px-[6px] py-px text-[10.5px] text-ink-muted">
                        {row.horizonLabel}
                      </span>
                    </div>
                    <div className="relative h-full flex-1">
                      <Link
                        href={hrefForGoal(row.goal.id)}
                        aria-label={`${row.goal.title}, ${row.percent} per cent complete`}
                        className="absolute inset-0 block"
                      >
                        {renderBar(row)}
                      </Link>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={row.key}
                  className="group relative flex items-center"
                  style={{ height: MILESTONE_ROW_H, width: rowWidth }}
                >
                  <div
                    className="sticky left-0 z-10 flex flex-shrink-0 items-center gap-2 bg-ground pl-[26px] pr-4 group-hover:bg-surface-2"
                    style={{ width: AXIS_ORIGIN }}
                  >
                    <span
                      className="truncate text-[12px] text-ink-muted"
                      title={`${row.milestone.title} (${row.taskLabel})`}
                    >
                      {row.milestone.title}
                    </span>
                  </div>
                  <div className="relative h-full flex-1">{renderBar(row)}</div>
                </div>
              );
            })}

            {/* nothing to draw — explain the horizon rule rather than show a void */}
            {rows.length === 0 ? (
              <div className="flex items-center py-8" style={{ width: rowWidth }}>
                <p
                  className="sticky left-0 z-20 max-w-[54ch] bg-ground pr-6 text-[13px] leading-relaxed text-ink-muted">
                  Nothing on the timeline yet. A goal appears here once it has a horizon — a
                  month, a quarter, a year, or explicit dates. Goals without one are tracked
                  just the same; they are simply never judged on pace.
                </p>
              </div>
            ) : null}

            {/* the trade-off for leaving a horizon off, stated rather than hidden */}
            {withoutHorizon > 0 ? (
              <div className="flex h-11 items-center" style={{ width: rowWidth }}>
                <div
                  className="sticky left-0 z-20 flex items-center whitespace-nowrap bg-ground pr-6 text-[12.5px] text-ink-muted">
                  {withoutHorizon} {withoutHorizon === 1 ? 'goal has' : 'goals have'} no horizon.
                  <Link
                    href={hrefForTable}
                    className="ml-1.5 text-signal underline-offset-2 hover:underline"
                  >
                    See them in the master table
                  </Link>
                </div>
              </div>
            ) : (
              <div className="h-5" />
            )}
          </div>
        </div>

        {/* deadline rail — overlays the grid, never shrinks it */}
        <AnimatePresence>
          {railOpen ? (
            <motion.aside
              key="rail"
              initial={reduceMotion ? false : { x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { x: 16, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="absolute bottom-0 right-0 top-0 z-40 w-[262px] overflow-y-auto border-l border-rule-strong bg-surface p-4 shadow-panel"
              aria-label="Due in the next 30 days"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="type-display text-[13px] text-ink">Due in 30 days</span>
                <button
                  type="button"
                  onClick={() => setRailOpen(false)}
                  className="-mr-1 flex h-9 items-center px-1 text-[12.5px] text-ink-muted hover:text-ink"
                >
                  Close
                </button>
              </div>
              {rail.length === 0 ? (
                <p className="text-[12.5px] leading-[1.45] text-ink-muted">
                  Nothing falls due in the next 30 days.
                </p>
              ) : (
                <ul className="flex list-none flex-col gap-1 p-0">
                  {rail.map((item) => (
                    <li key={item.key}>
                      <Link
                        href={hrefForGoal(item.goalId)}
                        className="-mx-2 flex flex-col gap-[3px] rounded-[4px] px-2 py-2 no-underline hover:bg-surface-2"
                      >
                        <span
                          className={
                            'type-condensed text-[11px] ' +
                            (item.daysAway <= 7 ? 'text-ink' : 'text-ink-faint')
                          }
                        >
                          {item.dateLabel}
                        </span>
                        <span className="text-[12.5px] leading-[1.35] text-ink">{item.title}</span>
                        <span className="text-[11.5px] text-ink-faint">{item.context}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>

      {/* mobile: one stacked bar per goal, no time axis */}
      <div className="border-t border-rule-strong lg:hidden">
        {rows.filter((row) => row.kind !== 'milestone').length === 0 ? (
          <p className="py-6 text-[13px] leading-relaxed text-ink-muted">
            Nothing on the timeline yet. A goal appears here once it has a horizon — a month, a
            quarter, a year, or explicit dates. Goals without one are tracked just the same; they
            are simply never judged on pace.
          </p>
        ) : null}

        {rows.map((row) => {
          if (row.kind === 'milestone') return null;
          if (row.kind === 'group') {
            return (
              <div
                key={row.key}
                className="type-display flex items-baseline gap-2 pb-1.5 pt-5 text-[12px] text-ink-muted"
              >
                {row.label}
                <span className="type-condensed text-[11px] text-ink-faint">{row.count}</span>
              </div>
            );
          }
          return (
            <Link
              key={row.key}
              href={hrefForGoal(row.goal.id)}
              className="block border-b border-rule py-3 no-underline"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-[14px] leading-[1.3] text-ink">{row.goal.title}</span>
                <span className="type-condensed flex-shrink-0 rounded-[3px] bg-surface-2 px-[6px] py-px text-[11px] text-ink-muted">
                  {row.horizonLabel}
                </span>
              </div>
              <div className="mt-2.5 h-[10px] overflow-hidden rounded-[3px] bg-track">
                <motion.div
                  className={'h-full rounded-[3px] ' + FILL_CLASS[row.tone]}
                  initial={false}
                  animate={{ width: `${row.percent}%` }}
                  transition={fillTransition}
                  style={{ opacity: FILL_OPACITY[row.tone] }}
                />
              </div>
              <div className="type-condensed mt-2 flex items-baseline justify-between gap-3 text-[11.5px] text-ink-muted">
                <span className="truncate">
                  {row.summary.progress.doneCount} of {row.summary.progress.totalCount} tasks
                  {row.summary.milestones.total > 0
                    ? `, ${row.summary.milestones.done} of ${row.summary.milestones.total} milestones`
                    : ''}
                </span>
                <span className="flex-shrink-0 text-ink">{row.percent}%</span>
              </div>
            </Link>
          );
        })}

        {withoutHorizon > 0 ? (
          <p className="py-4 text-[12.5px] leading-relaxed text-ink-muted">
            {withoutHorizon} {withoutHorizon === 1 ? 'goal has' : 'goals have'} no horizon.{' '}
            <Link href={hrefForTable} className="text-signal underline-offset-2 hover:underline">
              See them in the master table
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
