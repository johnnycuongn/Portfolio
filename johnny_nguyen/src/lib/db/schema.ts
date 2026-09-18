/**
 * Career dashboard — Postgres schema (Neon, via Drizzle).
 *
 * Two deliberate choices, both about what future-me can still change:
 *
 * 1. Enums are `text` + a CHECK constraint, never Postgres `enum` types. Adding a
 *    value to a PG enum is fine; removing or renaming one is a migration dance.
 *    A CHECK is a one-line ALTER.
 * 2. Ids are `text`, holding a uuid v4 generated in app code (`uuid`, already a
 *    dependency). Generating the id before the insert means the client knows the
 *    row's id without a round-trip, which is what optimistic UI needs.
 *
 * The CHECK constraints below are not belt-and-braces — they encode the three
 * rules the spec calls out as the discipline that makes the record worth having:
 * a milestone cannot be done without evidence, a goal cannot be dropped without a
 * reason, and a horizon value cannot contradict its type.
 */

import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  real,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  EFFORTS,
  GOAL_KINDS,
  GOAL_STATUSES,
  HORIZON_TYPES,
  ITEM_STATUSES,
  // Relative, not the `@/` alias: drizzle-kit loads this file outside the Next
  // build and does not resolve tsconfig path aliases.
} from '../career/types';

/**
 * `<column> in ('a', 'b')` for a CHECK. The values are module-level constants in
 * career/types.ts, never user input, so raw interpolation is safe here.
 */
function oneOf(column: string, values: readonly string[]) {
  return sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(', ')})`);
}

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/* --------------------------------------------------------------- competencies */

/** Five fixed seed rows. See COMPETENCY_SEED and scripts/seed-career.ts. */
export const competencies = pgTable('competencies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

/* ----------------------------------------------------------------------- goals */

export const goals = pgTable(
  'goals',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    /** One sentence, required. A goal without a why-line rots in the list. */
    why: text('why').notNull(),

    horizonType: text('horizon_type').notNull().default('none'),
    /** '2026-09' | '2026-Q3' | '2026'. Null when the type is none or custom. */
    horizonValue: text('horizon_value'),
    customStart: date('custom_start'),
    customEnd: date('custom_end'),

    /** Optional roll-up, one level only. Enforced in app code, not by the DB. */
    parentGoalId: text('parent_goal_id').references((): AnyPgColumn => goals.id, {
      onDelete: 'set null',
    }),

    kind: text('kind').notNull().default('skill'),
    status: text('status').notNull().default('backlog'),
    competencyId: text('competency_id')
      .notNull()
      .references(() => competencies.id),

    startedOn: date('started_on'),
    closedOn: date('closed_on'),
    /** Required on dropped. */
    closeNote: text('close_note'),

    /** Mainly for backlog sorting — "I have a free weekend, what can I finish". */
    estHours: real('est_hours'),
    /** For certifications. */
    cost: numeric('cost', { precision: 10, scale: 2, mode: 'number' }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('goals_status_idx').on(t.status),
    index('goals_parent_idx').on(t.parentGoalId),
    index('goals_competency_idx').on(t.competencyId),
    check('goals_horizon_type_valid', oneOf('horizon_type', HORIZON_TYPES)),
    check('goals_kind_valid', oneOf('kind', GOAL_KINDS)),
    check('goals_status_valid', oneOf('status', GOAL_STATUSES)),
    // Spec: "Required on dropped."
    check(
      'goals_dropped_needs_note',
      sql.raw(`status <> 'dropped' or close_note is not null`),
    ),
    // Spec: horizon_value is "null when type is none or custom", and is the period
    // itself otherwise — a monthly goal with no month cannot compute a target date.
    check(
      'goals_horizon_value_matches_type',
      sql.raw(
        `case when horizon_type in ('none', 'custom') then horizon_value is null else horizon_value is not null end`,
      ),
    ),
  ],
);

/* ------------------------------------------------------------------ milestones */

export const milestones = pgTable(
  'milestones',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('todo'),
    /** Inherits from the goal, overridable. */
    competencyId: text('competency_id')
      .notNull()
      .references(() => competencies.id),
    evidenceUrl: text('evidence_url'),
    evidenceNote: text('evidence_note'),
    /** Optional, for its own timeline marker. Goals never store one. */
    targetDate: date('target_date'),
    completedAt: date('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('milestones_goal_idx').on(t.goalId),
    index('milestones_competency_idx').on(t.competencyId),
    index('milestones_completed_at_idx').on(t.completedAt),
    check('milestones_status_valid', oneOf('status', ITEM_STATUSES)),
    // Spec: "A milestone cannot be marked done with both evidence fields empty."
    check(
      'milestones_done_needs_evidence',
      sql.raw(
        `status <> 'done' or evidence_url is not null or evidence_note is not null`,
      ),
    ),
  ],
);

/* ----------------------------------------------------------------------- tasks */

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    /** Always set, even when the task also sits under a milestone. */
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    /** Null when the goal has no milestones. */
    milestoneId: text('milestone_id').references(() => milestones.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    status: text('status').notNull().default('todo'),
    effort: text('effort').notNull().default('M'),
    startedOn: date('started_on'),
    completedAt: date('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tasks_goal_idx').on(t.goalId),
    index('tasks_milestone_idx').on(t.milestoneId),
    // Drives the heatmap and the completion trend, both of which scan by date.
    index('tasks_completed_at_idx').on(t.completedAt),
    index('tasks_status_idx').on(t.status),
    check('tasks_status_valid', oneOf('status', ITEM_STATUSES)),
    check('tasks_effort_valid', oneOf('effort', EFFORTS)),
  ],
);

/* ------------------------------------------------------------------------ wins */

/** Achievements that were never planned. Often the best promotion evidence. */
export const wins = pgTable(
  'wins',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    happenedOn: date('happened_on').notNull(),
    competencyId: text('competency_id')
      .notNull()
      .references(() => competencies.id),
    /** The number, where one exists. */
    impactNote: text('impact_note').notNull().default(''),
    evidenceUrl: text('evidence_url'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('wins_happened_on_idx').on(t.happenedOn),
    index('wins_competency_idx').on(t.competencyId),
  ],
);

/* -------------------------------------------------------------------- settings */

/** Key/value blobs. The dashboard layout lives here as `layout/default`. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
});

/* -------------------------------------------------------------- admin_attempts */

/**
 * Rate limiting for the code gate. There is no auth here — one static code is the
 * whole boundary — so the only defence against someone grinding through codes is
 * counting attempts per hashed IP. The IP is hashed, never stored raw.
 */
export const adminAttempts = pgTable(
  'admin_attempts',
  {
    id: text('id').primaryKey(),
    ipHash: text('ip_hash').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
    succeeded: boolean('succeeded').notNull().default(false),
  },
  (t) => [index('admin_attempts_ip_time_idx').on(t.ipHash, t.attemptedAt)],
);

/* ----------------------------------------------------------------- row types */

export type Competency = InferSelectModel<typeof competencies>;
export type NewCompetency = InferInsertModel<typeof competencies>;

export type Goal = InferSelectModel<typeof goals>;
export type NewGoal = InferInsertModel<typeof goals>;

export type Milestone = InferSelectModel<typeof milestones>;
export type NewMilestone = InferInsertModel<typeof milestones>;

export type Task = InferSelectModel<typeof tasks>;
export type NewTask = InferInsertModel<typeof tasks>;

export type Win = InferSelectModel<typeof wins>;
export type NewWin = InferInsertModel<typeof wins>;

export type Setting = InferSelectModel<typeof settings>;
export type NewSetting = InferInsertModel<typeof settings>;

export type AdminAttempt = InferSelectModel<typeof adminAttempts>;
export type NewAdminAttempt = InferInsertModel<typeof adminAttempts>;
