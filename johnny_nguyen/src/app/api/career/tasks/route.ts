import { asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { v4 as uuid } from 'uuid';

import { db } from '@/lib/db';
import { goals, milestones, tasks } from '@/lib/db/schema';
import { adminOnly } from '@/lib/career/auth';
import { isEffort, isItemStatus } from '@/lib/career/types';
import { parseIsoDate, toIsoDate } from '@/lib/career/horizon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tasks — list (public) and create (admin).
 *
 * The atom, and deliberately the cheapest thing in the system to add: a title, a
 * goal, an optional milestone and an effort size. No evidence field, no
 * ceremony. Everything else is derived — `startedOn` when it moves to Doing,
 * `completedAt` when it is ticked.
 */

/* --- route preamble: duplicated across the career routes, see goals/route.ts --- */

type Body = Record<string, unknown>;

const has = (body: Body, key: string) => Object.prototype.hasOwnProperty.call(body, key);

class FieldError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function fail(status: number, error: string, message: string, field?: string): Response {
  return Response.json({ ok: false, error, message, ...(field ? { field } : {}) }, { status });
}

function caught(error: unknown, where: string): Response {
  if (error instanceof FieldError) {
    return fail(error.status, error.code, error.message, error.field);
  }
  console.error(where, error);
  return fail(500, 'server_error', 'The write did not go through. Nothing was changed.');
}

async function readBody(request: Request): Promise<Body> {
  try {
    const value: unknown = await request.json();
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Body;
  } catch {
    /* fall through */
  }
  throw new FieldError(400, 'invalid_body', 'Expected a JSON object.');
}

function optText(body: Body, key: string, max = 2000): string | null | undefined {
  if (!has(body, key)) return undefined;
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new FieldError(400, 'invalid_field', `${key} must be a string or null.`, key);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new FieldError(400, 'invalid_field', `${key} is longer than ${max} characters.`, key);
  }
  return trimmed.length > 0 ? trimmed : null;
}

function reqText(body: Body, key: string, max = 2000): string {
  const value = optText(body, key, max);
  if (!value) throw new FieldError(400, 'invalid_field', `${key} is required.`, key);
  return value;
}

function optIso(body: Body, key: string): string | null | undefined {
  const value = optText(body, key, 10);
  if (value === undefined || value === null) return value;
  if (!parseIsoDate(value)) {
    throw new FieldError(400, 'invalid_field', `${key} must be a date as YYYY-MM-DD.`, key);
  }
  return value;
}

function optOneOf<T extends string>(
  body: Body,
  key: string,
  guard: (v: unknown) => v is T,
): T | undefined {
  if (!has(body, key)) return undefined;
  const value = body[key];
  if (!guard(value)) {
    throw new FieldError(400, 'invalid_field', `${String(value)} is not a valid ${key}.`, key);
  }
  return value;
}

function today(body: Body): string {
  return optIso(body, 'today') ?? toIsoDate(new Date());
}

function revalidateCareer(): void {
  revalidatePath('/career', 'layout');
}

/* ---------------------------------------------------------------------- GET */

export async function GET(): Promise<Response> {
  try {
    const rows = await db.select().from(tasks).orderBy(asc(tasks.goalId), asc(tasks.createdAt));
    return Response.json({ ok: true, tasks: rows });
  } catch (error) {
    return caught(error, 'api/career/tasks GET');
  }
}

/* --------------------------------------------------------------------- POST */

export async function POST(request: Request): Promise<Response> {
  const denied = await adminOnly();
  if (denied) return denied;

  try {
    const body = await readBody(request);
    const stamp = today(body);

    const goalId = reqText(body, 'goalId', 64);
    const [goal] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(eq(goals.id, goalId))
      .limit(1);
    if (!goal) {
      throw new FieldError(422, 'goal_not_found', 'That goal does not exist.', 'goalId');
    }

    // `goal_id` is always set, even when the task also sits under a milestone —
    // that is what lets the goal roll-up be a flat count over its own tasks.
    const milestoneId = optText(body, 'milestoneId', 64) ?? null;
    if (milestoneId) {
      const [milestone] = await db
        .select({ id: milestones.id, goalId: milestones.goalId })
        .from(milestones)
        .where(eq(milestones.id, milestoneId))
        .limit(1);
      if (!milestone) {
        throw new FieldError(
          422,
          'milestone_not_found',
          'That milestone does not exist.',
          'milestoneId',
        );
      }
      if (milestone.goalId !== goalId) {
        throw new FieldError(
          422,
          'milestone_goal_mismatch',
          'That milestone belongs to a different goal.',
          'milestoneId',
        );
      }
    }

    const title = reqText(body, 'title', 300);
    const status = optOneOf(body, 'status', isItemStatus) ?? 'todo';
    const effort = optOneOf(body, 'effort', isEffort) ?? 'M';

    const startedOn =
      optIso(body, 'startedOn') ?? (status === 'doing' || status === 'done' ? stamp : null);
    const completedAt = optIso(body, 'completedAt') ?? (status === 'done' ? stamp : null);

    const [task] = await db
      .insert(tasks)
      .values({
        id: uuid(),
        goalId,
        milestoneId,
        title,
        status,
        effort,
        startedOn,
        completedAt,
      })
      .returning();

    revalidateCareer();
    return Response.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    return caught(error, 'api/career/tasks POST');
  }
}
