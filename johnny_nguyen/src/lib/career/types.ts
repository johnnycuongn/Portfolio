/**
 * Career dashboard — value sets and the structural shapes the pure logic works on.
 *
 * This module has NO dependency on drizzle, the database, or React, so it is safe
 * to import from a client component. The DB row types (`Goal`, `Milestone`, …) live
 * in `@/lib/db/schema` and structurally satisfy the `*Like` shapes declared here,
 * so you can pass a row straight into `horizon.ts` / `rollup.ts`.
 *
 * Enums are modelled as `as const` arrays rather than TS `enum`s: the array is the
 * single source of truth for both the TS union and the Postgres CHECK constraint.
 */

/* ------------------------------------------------------------------ value sets */

export const HORIZON_TYPES = ['none', 'monthly', 'quarterly', 'yearly', 'custom'] as const;
export type HorizonType = (typeof HORIZON_TYPES)[number];

export const GOAL_KINDS = ['skill', 'certification', 'domain', 'role', 'project'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const GOAL_STATUSES = ['active', 'paused', 'backlog', 'done', 'dropped'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** Shared by milestones and tasks. */
export const ITEM_STATUSES = ['todo', 'doing', 'done'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const EFFORTS = ['S', 'M', 'L'] as const;
export type Effort = (typeof EFFORTS)[number];

/** Spec: "weight tasks by effort, S=1, M=3, L=5". Off by default — see rollup.ts. */
export const EFFORT_WEIGHT: Record<Effort, number> = { S: 1, M: 3, L: 5 };

/* ---------------------------------------------------------------- competencies */

/** Five rows, fixed forever. These ids are part of the data contract — never change them. */
export const COMPETENCY_IDS = [
  'technical_judgment',
  'scope_of_ownership',
  'people_impact',
  'business_impact',
  'communication_influence',
] as const;
export type CompetencyId = (typeof COMPETENCY_IDS)[number];

export const COMPETENCY_SEED: ReadonlyArray<{
  id: CompetencyId;
  name: string;
  sortOrder: number;
}> = [
  { id: 'technical_judgment', name: 'Technical judgment', sortOrder: 1 },
  { id: 'scope_of_ownership', name: 'Scope of ownership', sortOrder: 2 },
  { id: 'people_impact', name: 'People impact', sortOrder: 3 },
  { id: 'business_impact', name: 'Business impact', sortOrder: 4 },
  { id: 'communication_influence', name: 'Communication & influence', sortOrder: 5 },
];

/* -------------------------------------------------------------------- settings */

/** The dashboard layout lives in `settings` under this key. */
export const LAYOUT_SETTINGS_KEY = 'layout/default';

/* ------------------------------------------------------- structural input shapes */

/**
 * An ISO calendar date, `YYYY-MM-DD`. Every `date` column is read and written as
 * this string — no `Date` objects round-trip through the database, which keeps a
 * server in one timezone from shifting a day against a browser in another.
 */
export type IsoDate = string;

/** Everything `horizon.ts` needs. A `Goal` row satisfies this. */
export type HorizonSpec = {
  horizonType: HorizonType | string;
  horizonValue: string | null;
  customStart: IsoDate | null;
  customEnd: IsoDate | null;
};

/** Everything `rollup.ts` needs from a task. A `Task` row satisfies this. */
export type TaskLike = {
  goalId: string;
  milestoneId: string | null;
  status: ItemStatus | string;
  effort: Effort | string;
};

/** Everything `rollup.ts` needs from a milestone. A `Milestone` row satisfies this. */
export type MilestoneLike = {
  id: string;
  goalId: string;
  status: ItemStatus | string;
};

/** Everything `rollup.ts` needs from a goal when rolling a parent up over its children. */
export type GoalLike = HorizonSpec & {
  id: string;
  parentGoalId: string | null;
};

/* ---------------------------------------------------------------- type guards */

export const isHorizonType = (v: unknown): v is HorizonType =>
  typeof v === 'string' && (HORIZON_TYPES as readonly string[]).includes(v);

export const isGoalKind = (v: unknown): v is GoalKind =>
  typeof v === 'string' && (GOAL_KINDS as readonly string[]).includes(v);

export const isGoalStatus = (v: unknown): v is GoalStatus =>
  typeof v === 'string' && (GOAL_STATUSES as readonly string[]).includes(v);

export const isItemStatus = (v: unknown): v is ItemStatus =>
  typeof v === 'string' && (ITEM_STATUSES as readonly string[]).includes(v);

export const isEffort = (v: unknown): v is Effort =>
  typeof v === 'string' && (EFFORTS as readonly string[]).includes(v);

export const isCompetencyId = (v: unknown): v is CompetencyId =>
  typeof v === 'string' && (COMPETENCY_IDS as readonly string[]).includes(v);
