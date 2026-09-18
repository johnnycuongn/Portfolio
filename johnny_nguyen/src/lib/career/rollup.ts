/**
 * Career dashboard — progress rollup. Pure functions, no database.
 *
 * The spec's rules, in one place, because every screen needs the same number and
 * two screens disagreeing about a goal's percentage is the fastest way to stop
 * trusting the dashboard:
 *
 *   - Goal %      = done tasks / all tasks on the goal, whether or not they sit
 *                   under a milestone. A *flat* count, deliberately: a five-task
 *                   milestone is worth five times a one-task milestone, because it
 *                   is five times the work.
 *   - Milestone % = done tasks / its own tasks.
 *   - Parent %    = flat task count across the parent and its children, one level.
 *   - Pace        = goal % minus the fraction of the horizon window elapsed.
 *                   Positive is ahead. Null when there is no horizon — a goal with
 *                   no horizon is never late, which is the point of leaving it off.
 *   - Effort weighting (S=1, M=3, L=5) is available and OFF by default. Turn it on
 *     only if unweighted percentages start feeling dishonest.
 *
 * A goal with zero tasks is 0%, never NaN — it is the ordinary state of a goal you
 * just created, not an error.
 */

import { elapsedFraction, isPastTarget } from './horizon';
import {
  EFFORT_WEIGHT,
  type Effort,
  type GoalLike,
  type MilestoneLike,
  type TaskLike,
} from './types';

export type RollupOptions = {
  /** Spec's "optional refinement, off by default". */
  weightByEffort?: boolean;
};

export type Progress = {
  /** Done tasks (or summed weight of them, when weighting is on). */
  done: number;
  /** All tasks (or summed weight). Zero means the thing has no tasks yet. */
  total: number;
  /** done / total, clamped 0–1. Exactly 0 when there are no tasks. */
  fraction: number;
  /** Plain task counts, unaffected by weighting — for `8/14 tasks`. */
  doneCount: number;
  totalCount: number;
};

export const EMPTY_PROGRESS: Progress = {
  done: 0,
  total: 0,
  fraction: 0,
  doneCount: 0,
  totalCount: 0,
};

function weightOf(task: TaskLike, options?: RollupOptions): number {
  if (!options?.weightByEffort) return 1;
  return EFFORT_WEIGHT[task.effort as Effort] ?? 1;
}

/** Progress over an already-filtered list of tasks. The primitive the rest build on. */
export function progressOf(tasks: readonly TaskLike[], options?: RollupOptions): Progress {
  let done = 0;
  let total = 0;
  let doneCount = 0;

  for (const task of tasks) {
    const weight = weightOf(task, options);
    total += weight;
    if (task.status === 'done') {
      done += weight;
      doneCount += 1;
    }
  }

  return {
    done,
    total,
    // Zero tasks is 0%, not a divide-by-zero.
    fraction: total > 0 ? Math.min(1, Math.max(0, done / total)) : 0,
    doneCount,
    totalCount: tasks.length,
  };
}

/** Flat progress for one goal: every task on it, milestone or not. */
export function goalProgress(
  goalId: string,
  tasks: readonly TaskLike[],
  options?: RollupOptions,
): Progress {
  return progressOf(
    tasks.filter((t) => t.goalId === goalId),
    options,
  );
}

/** Progress for one milestone: only the tasks pointing at it. */
export function milestoneProgress(
  milestoneId: string,
  tasks: readonly TaskLike[],
  options?: RollupOptions,
): Progress {
  return progressOf(
    tasks.filter((t) => t.milestoneId === milestoneId),
    options,
  );
}

/** The ids rolled up into a goal's bar: itself plus its direct children. One level only. */
export function rollupGoalIds(goalId: string, goals: readonly GoalLike[]): string[] {
  const children = goals.filter((g) => g.parentGoalId === goalId).map((g) => g.id);
  return [goalId, ...children.filter((id) => id !== goalId)];
}

/**
 * A parent goal's percentage: the flat task count across itself and its children.
 * For a goal with no children this is identical to `goalProgress`, so screens can
 * call it unconditionally.
 */
export function parentGoalProgress(
  goalId: string,
  goals: readonly GoalLike[],
  tasks: readonly TaskLike[],
  options?: RollupOptions,
): Progress {
  const ids = new Set(rollupGoalIds(goalId, goals));
  return progressOf(
    tasks.filter((t) => ids.has(t.goalId)),
    options,
  );
}

/** `3 of 5 milestones` — the text beside the bar. Never weighted. */
export function milestoneCounts(
  goalId: string,
  milestones: readonly MilestoneLike[],
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const milestone of milestones) {
    if (milestone.goalId !== goalId) continue;
    total += 1;
    if (milestone.status === 'done') done += 1;
  }
  return { done, total };
}

/**
 * Pace: progress minus elapsed. Positive is ahead of the window, negative behind.
 * Null in, null out — a goal with no horizon has no pace and must never be styled
 * as though it were behind.
 */
export function pace(progressFraction: number, elapsed: number | null): number | null {
  if (elapsed === null) return null;
  return progressFraction - elapsed;
}

/**
 * The pace dot on a goal card. `none` means "no horizon, draw nothing" — not a
 * neutral colour, no dot at all. Thresholds live here so the dashboard, the
 * timeline and the master table cannot drift apart.
 */
export type PaceBand = 'none' | 'ahead' | 'slightly-behind' | 'behind';

export function paceBand(paceValue: number | null): PaceBand {
  if (paceValue === null) return 'none';
  if (paceValue >= 0) return 'ahead';
  if (paceValue > -0.15) return 'slightly-behind';
  return 'behind';
}

/* ---------------------------------------------------------------- goal summary */

export type GoalSummary = {
  goalId: string;
  /** Flat across the goal and, when it has them, its children. */
  progress: Progress;
  milestones: { done: number; total: number };
  /** 0–1, or null when the goal has no horizon. */
  elapsed: number | null;
  /** progress.fraction − elapsed, or null. */
  pace: number | null;
  paceBand: PaceBand;
  /** True only when a real target date exists and has passed. */
  pastTarget: boolean;
};

/**
 * Everything a goal card, a timeline bar or a table row needs about one goal, in a
 * single pass. Pass the full task/milestone/goal lists; filtering happens here.
 */
export function goalSummary(
  goal: GoalLike,
  goals: readonly GoalLike[],
  milestones: readonly MilestoneLike[],
  tasks: readonly TaskLike[],
  today: Date,
  options?: RollupOptions,
): GoalSummary {
  const progress = parentGoalProgress(goal.id, goals, tasks, options);
  const elapsed = elapsedFraction(goal, today);
  const paceValue = pace(progress.fraction, elapsed);
  const pastTarget = isPastTarget(goal, today);

  // Past its date and not finished reads as "behind" however small the gap is.
  const band: PaceBand =
    pastTarget && progress.fraction < 1 ? 'behind' : paceBand(paceValue);

  return {
    goalId: goal.id,
    progress,
    milestones: milestoneCounts(goal.id, milestones),
    elapsed,
    pace: paceValue,
    paceBand: band,
    pastTarget,
  };
}

/** Whole percent, for display. `0.666…` -> `67`. */
export function percent(fraction: number): number {
  return Math.round(fraction * 100);
}
