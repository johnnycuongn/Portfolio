/**
 * The shared server-side read path for every career screen.
 *
 * Server only. Nothing here is exported to the browser and nothing here mutates:
 * the public `/career` tree renders entirely from these functions, so the read path
 * is *structurally* incapable of writing. Mutations live behind the API routes,
 * every one of which calls `adminOnly()`. That separation is the boundary — hiding
 * the admin UI is cosmetic.
 *
 * On volume: the dashboard reads the whole of goals/milestones/tasks/wins in one
 * pass and does the rest in memory. This is a personal ledger, not a SaaS — the
 * tables hold hundreds of rows, not millions — and every zone, the timeline and the
 * heatmap all need overlapping slices of the same data. One round of five parallel
 * reads is cheaper and far simpler than a dozen targeted queries that would each
 * have to re-derive the same rollups.
 */

import { asc, desc } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  competencies,
  goals,
  milestones,
  settings,
  tasks,
  wins,
  type Competency,
  type Goal,
  type Milestone,
  type Task,
  type Win,
} from '@/lib/db/schema';
import { LAYOUT_SETTINGS_KEY, type IsoDate } from '@/lib/career/types';
import { toIsoDate } from '@/lib/career/horizon';
import { normalizeLayout, type DashboardLayout } from './_components/PanelLayout/layout';

/**
 * Today as a calendar day.
 *
 * Computed once on the server and threaded through as a string, never recomputed in
 * the browser — a server in UTC and a phone in UTC+11 disagreeing about "today"
 * would show two different heatmaps and a hydration mismatch with them.
 */
export function todayIso(): IsoDate {
  return toIsoDate(new Date());
}

/* ------------------------------------------------------------- single tables */

export function getCompetencies(): Promise<Competency[]> {
  return db.select().from(competencies).orderBy(asc(competencies.sortOrder));
}

export function getGoals(): Promise<Goal[]> {
  return db.select().from(goals).orderBy(asc(goals.createdAt));
}

export function getMilestones(): Promise<Milestone[]> {
  return db.select().from(milestones).orderBy(asc(milestones.sortOrder), asc(milestones.createdAt));
}

export function getTasks(): Promise<Task[]> {
  return db.select().from(tasks).orderBy(asc(tasks.createdAt));
}

export function getWins(): Promise<Win[]> {
  return db.select().from(wins).orderBy(desc(wins.happenedOn));
}

/* -------------------------------------------------------------------- layout */

/**
 * The stored dashboard arrangement, or the default when nothing is stored yet.
 *
 * Total by construction: `normalizeLayout` turns any shape at all into a renderable
 * layout, and a database that is unreachable still yields the default rather than
 * an error — a broken layout row must never be able to take the dashboard down.
 */
export async function getLayout(): Promise<DashboardLayout> {
  try {
    const rows = await db.select().from(settings);
    const row = rows.find((r) => r.key === LAYOUT_SETTINGS_KEY);
    return normalizeLayout(row?.value);
  } catch {
    return normalizeLayout(undefined);
  }
}

/* --------------------------------------------------------------- everything */

export type DashboardData = {
  competencies: Competency[];
  goals: Goal[];
  milestones: Milestone[];
  tasks: Task[];
  wins: Win[];
  layout: DashboardLayout;
  today: IsoDate;
};

/**
 * Every row the dashboard, the timeline and the heatmap need, in one pass.
 *
 * Also the query the other screens build on: the master table wants the same four
 * tables denormalised, and the achievements screen wants milestones + wins. Sharing
 * this one function is what stops two screens quietly disagreeing about a goal's
 * percentage, which is the fastest way to stop trusting the dashboard.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [competencyRows, goalRows, milestoneRows, taskRows, winRows, layout] = await Promise.all([
    getCompetencies(),
    getGoals(),
    getMilestones(),
    getTasks(),
    getWins(),
    getLayout(),
  ]);

  return {
    competencies: competencyRows,
    goals: goalRows,
    milestones: milestoneRows,
    tasks: taskRows,
    wins: winRows,
    layout,
    today: todayIso(),
  };
}

export type DashboardLoad =
  | { ok: true; data: DashboardData }
  | { ok: false; reason: string };

/**
 * `getDashboardData` with the database failure folded into the return value.
 *
 * The page uses this rather than letting the throw escape, for one reason: the very
 * first deploy of this app runs before Neon is provisioned, and a 500 on `/career`
 * with a stack trace is a worse first impression than a calm line saying the
 * database is not connected yet. The message is the error's own — it names the
 * missing variable, never a value.
 */
export async function loadDashboard(): Promise<DashboardLoad> {
  try {
    return { ok: true, data: await getDashboardData() };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'The dashboard could not reach its database.';
    // Operator-facing. The visitor sees the calm empty state, not this.
    console.error('career/_queries: dashboard read failed', error);
    return { ok: false, reason };
  }
}

/**
 * Goals a quick-add can attach a milestone or a task to: everything still live,
 * newest-feeling first (active, then backlog, then paused).
 */
export async function getAttachableGoals(): Promise<
  { id: string; title: string; status: string; competencyId: string }[]
> {
  const rows = await getGoals();
  const rank: Record<string, number> = { active: 0, backlog: 1, paused: 2 };
  return rows
    .filter((g) => g.status === 'active' || g.status === 'backlog' || g.status === 'paused')
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.title.localeCompare(b.title))
    .map((g) => ({ id: g.id, title: g.title, status: g.status, competencyId: g.competencyId }));
}
