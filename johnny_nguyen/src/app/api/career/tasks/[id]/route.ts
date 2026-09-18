import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { goals, milestones, tasks, type Task } from '@/lib/db/schema';
import { adminOnly } from '@/lib/career/auth';
import { isEffort, isItemStatus } from '@/lib/career/types';
import { parseIsoDate, toIsoDate } from '@/lib/career/horizon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One task — read (public) and patch (admin).
 *
 * This is the hot path: ticking a task is one click, with no confirmation and an
 * undo toast. The undo in the response is a real inverse PATCH built from the
 * row as it was, so pressing Undo writes the old values back rather than just
 * repainting the screen and hoping.
 *
 * No DELETE. A task that turned out not to matter is moved, not erased.
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

/* ----------------------------------------------------------------------- undo */

type UndoStep = { method: 'PATCH'; path: string; body: Record<string, unknown> };

function undoFor(
  path: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[],
): UndoStep | null {
  const body: Record<string, unknown> = {};
  for (const key of keys) {
    if (!Object.is(before[key] ?? null, after[key] ?? null)) body[key] = before[key] ?? null;
  }
  return Object.keys(body).length > 0 ? { method: 'PATCH', path, body } : null;
}

const TASK_COLUMNS = [
  'goalId',
  'milestoneId',
  'title',
  'status',
  'effort',
  'startedOn',
  'completedAt',
] as const;

/* ---------------------------------------------------------------------- GET */

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!task) return fail(404, 'not_found', 'No task with that id.');
    return Response.json({ ok: true, task });
  } catch (error) {
    return caught(error, 'api/career/tasks/[id] GET');
  }
}

/* -------------------------------------------------------------------- PATCH */

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await adminOnly();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await readBody(request);
    const stamp = today(body);

    const [before] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!before) return fail(404, 'not_found', 'No task with that id.');

    const patch: Partial<Task> = {};

    if (has(body, 'title')) {
      const title = optText(body, 'title', 300);
      if (!title) throw new FieldError(400, 'invalid_field', 'A task needs a title.', 'title');
      patch.title = title;
    }

    const effort = optOneOf(body, 'effort', isEffort);
    if (effort) patch.effort = effort;

    // --- goal / milestone, validated together -----------------------------------
    if (has(body, 'goalId') || has(body, 'milestoneId')) {
      const goalId = has(body, 'goalId') ? (optText(body, 'goalId', 64) ?? '') : before.goalId;
      if (!goalId) {
        throw new FieldError(400, 'invalid_field', 'A task always belongs to a goal.', 'goalId');
      }
      if (goalId !== before.goalId) {
        const [goal] = await db
          .select({ id: goals.id })
          .from(goals)
          .where(eq(goals.id, goalId))
          .limit(1);
        if (!goal) {
          throw new FieldError(422, 'goal_not_found', 'That goal does not exist.', 'goalId');
        }
        patch.goalId = goalId;
      }

      const milestoneId = has(body, 'milestoneId')
        ? (optText(body, 'milestoneId', 64) ?? null)
        : before.milestoneId;
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
      if (has(body, 'milestoneId')) patch.milestoneId = milestoneId;
    }

    // --- status and its dates ----------------------------------------------------
    const status = optOneOf(body, 'status', isItemStatus);
    if (status && status !== before.status) {
      patch.status = status;

      if (status === 'doing' || status === 'done') {
        if (!before.startedOn && !has(body, 'startedOn')) patch.startedOn = stamp;
      }
      if (status === 'done') {
        if (!has(body, 'completedAt')) patch.completedAt = before.completedAt ?? stamp;
      } else if (!has(body, 'completedAt')) {
        // Unticking it. `startedOn` stays: it genuinely was started once, and the
        // "21 days in Doing" marker in the master table depends on that date.
        patch.completedAt = null;
      }
    }

    // Explicit values always win over the derived ones above — this is what lets
    // an undo step restore the exact dates the row had before.
    if (has(body, 'startedOn')) patch.startedOn = optIso(body, 'startedOn') ?? null;
    if (has(body, 'completedAt')) patch.completedAt = optIso(body, 'completedAt') ?? null;

    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: true, task: before, undo: [] });
    }

    const [after] = await db
      .update(tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();

    revalidateCareer();

    const undo = undoFor(`/api/career/tasks/${id}`, before, after, TASK_COLUMNS);
    return Response.json({ ok: true, task: after, undo: undo ? [undo] : [] });
  } catch (error) {
    return caught(error, 'api/career/tasks/[id] PATCH');
  }
}
