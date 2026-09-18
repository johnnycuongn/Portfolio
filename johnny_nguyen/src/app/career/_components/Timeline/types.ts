/**
 * Timeline — the props contract.
 *
 * The timeline is presentational: it fetches nothing and mutates nothing. It takes
 * the three row arrays, a `today`, and optionally the rollups the rest of the
 * dashboard has already computed, and draws them. Everything it needs to know about
 * progress comes from `@/lib/career/rollup`, so a goal's percentage here and on its
 * card below can never disagree.
 */

import type { GoalSummary, RollupOptions } from '@/lib/career/rollup';
import type { Goal, Milestone, Task } from '@/lib/db/schema';
import type { TimelineZoom } from './scale';

/**
 * Rollups keyed by goal id. Optional: pass the map the dashboard already built for
 * the goal cards and the timeline reuses it, or leave it out and the timeline
 * computes the same thing itself with `goalSummary`.
 */
export type GoalSummaryMap = Readonly<Record<string, GoalSummary>>;

export type TimelineProps = {
  goals: readonly Goal[];
  milestones: readonly Milestone[];
  tasks: readonly Task[];

  /** Today, as a UTC-midnight date. Passed in so the server and client agree. */
  today: Date;

  /**
   * Admin tree passes true, public tree false. It changes where a goal link points
   * (`/career/goal/x` vs `/career/admin/goal/x`) and nothing else — there is no
   * editing on the timeline itself, and the API is the real boundary regardless.
   */
  editable: boolean;

  /** Precomputed rollups. Omit and the timeline derives them. */
  summaries?: GoalSummaryMap;

  /** Effort weighting, only consulted when `summaries` is not supplied. */
  rollupOptions?: RollupOptions;

  /** Zoom on first render. Defaults to `quarter`, the view worth screen-sharing. */
  initialZoom?: TimelineZoom;

  /** Milestone rows on by default, task segments off — the spec's defaults. */
  initialLayers?: { milestones?: boolean; tasks?: boolean };

  /** Where "N goals without a horizon" points. Defaults by `editable`. */
  tableHref?: string;

  /** Link for a goal bar. Defaults to the goal-detail route for the current tree. */
  goalHref?: (goalId: string) => string;

  /** Extra classes on the outer panel, for the layout the dashboard arranges. */
  className?: string;
};

/* ------------------------------------------------------------- internal rows */

export type TimelineRowKind = 'group' | 'goal' | 'milestone';

export type BarTone = 'active' | 'paused' | 'done' | 'past-due';

export type BarSegment = {
  key: string;
  filled: boolean;
  title: string;
};

export type TimelineRow =
  | {
      kind: 'group';
      key: string;
      label: string;
      count: number;
    }
  | {
      kind: 'goal';
      key: string;
      goal: Goal;
      summary: GoalSummary;
      tone: BarTone;
      percent: number;
      window: { start: Date; end: Date };
      horizonLabel: string;
      segments: BarSegment[] | null;
      /** Milestone target dates, drawn as ticks when the milestone layer is off. */
      ticks: { key: string; date: Date; title: string }[];
    }
  | {
      kind: 'milestone';
      key: string;
      milestone: Milestone;
      goalId: string;
      percent: number;
      complete: boolean;
      window: { start: Date; end: Date };
      segments: BarSegment[] | null;
      taskLabel: string;
    };
