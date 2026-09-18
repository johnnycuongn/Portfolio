import { and, eq, inArray, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { milestones, tasks, type Milestone, type Task } from '@/lib/db/schema';
import { adminOnly } from '@/lib/career/auth';
import { isCompetencyId, isItemStatus } from '@/lib/career/types';
import { parseIsoDate, toIsoDate } from '@/lib/career/horizon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One milestone — read (public) and patch (admin).
 *
 * Two spec rules live here and nowhere else:
 *
 *   1. "A milestone cannot be marked done with both evidence fields empty."
 *      The database enforces it with a CHECK; this route enforces it first so
 *      the answer is a readable 422 instead of a constraint violation.
 *   2. "A milestone can also be marked done directly, which completes its
 *      remaining tasks." That cascade happens server-side, and every task it
 *      touches comes back in the undo steps, so one click of Undo puts the
 *      whole thing back — not just the milestone row.
 *
 * No DELETE: completing a milestone moves it, it never removes it.
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

const MILESTONE_COLUMNS = [
  'title',
  'sortOrder',
  'status',
  'competencyId',
  'evidenceUrl',
  'evidenceNote',
  'targetDate',
  'completedAt',
] as const;

const TASK_COLUMNS = ['status', 'completedAt', 'startedOn'] as const;

/* ---------------------------------------------------------------------- GET */

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const [milestone] = await db.select().from(milestones).where(eq(milestones.id, id)).limit(1);
    if (!milestone) return fail(404, 'not_found', 'No milestone with that id.');
    return Response.json({ ok: true, milestone });
  } catch (error) {
    return caught(error, 'api/career/milestones/[id] GET');
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

    const [before] = await db.select().from(milestones).where(eq(milestones.id, id)).limit(1);
    if (!before) return fail(404, 'not_found', 'No milestone with that id.');

    const patch: Partial<Milestone> = {};

    if (has(body, 'title')) {
      const title = optText(body, 'title', 300);
      if (!title) throw new FieldError(400, 'invalid_field', 'A milestone needs a title.', 'title');
      patch.title = title;
    }
    if (has(body, 'sortOrder')) {
      const value = body['sortOrder'];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new FieldError(400, 'invalid_field', 'sortOrder must be a number.', 'sortOrder');
      }
      patch.sortOrder = Math.trunc(value);
    }
    const competencyId = optOneOf(body, 'competencyId', isCompetencyId);
    if (competencyId) patch.competencyId = competencyId;

    if (has(body, 'evidenceUrl')) patch.evidenceUrl = optText(body, 'evidenceUrl', 1000) ?? null;
    if (has(body, 'evidenceNote')) patch.evidenceNote = optText(body, 'evidenceNote', 2000) ?? null;
    if (has(body, 'targetDate')) patch.targetDate = optIso(body, 'targetDate') ?? null;

    const status = optOneOf(body, 'status', isItemStatus);
    const nextStatus = status ?? before.status;
    const becomingDone = status === 'done' && before.status !== 'done';

    // Checked against the MERGED row. Evidence already on the milestone counts,
    // so ticking one that was captured with a note does not ask twice — and
    // emptying both fields on an already-done milestone breaks the same rule,
    // which is why this is not nested inside a status change.
    const nextEvidenceUrl = has(body, 'evidenceUrl')
      ? (patch.evidenceUrl ?? null)
      : before.evidenceUrl;
    const nextEvidenceNote = has(body, 'evidenceNote')
      ? (patch.evidenceNote ?? null)
      : before.evidenceNote;

    if (nextStatus === 'done' && !nextEvidenceUrl && !nextEvidenceNote) {
      throw new FieldError(
        422,
        'evidence_required',
        'A milestone needs a link or a note before it can be done. That evidence is what turns the log into a promotion packet.',
        'evidenceUrl',
      );
    }

    if (status && status !== before.status) {
      patch.status = status;

      if (status === 'done') {
        if (!has(body, 'completedAt')) patch.completedAt = before.completedAt ?? stamp;
      } else if (!has(body, 'completedAt')) {
        patch.completedAt = null;
      }
    }

    if (has(body, 'completedAt')) patch.completedAt = optIso(body, 'completedAt') ?? null;

    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: true, milestone: before, completedTasks: [], undo: [] });
    }

    const [after] = await db
      .update(milestones)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(milestones.id, id))
      .returning();

    // --- the cascade -----------------------------------------------------------
    // Spec: marking a milestone done completes its remaining tasks. The driver is
    // neon-http, which has no interactive transactions, so this is a second
    // statement. It is idempotent — re-marking the milestone done re-runs it — so
    // a failure between the two leaves nothing that a second click cannot repair.
    let completedTasks: Task[] = [];
    const taskUndo: UndoStep[] = [];

    if (becomingDone) {
      const remaining = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.milestoneId, id), ne(tasks.status, 'done')));

      if (remaining.length > 0) {
        completedTasks = await db
          .update(tasks)
          .set({ status: 'done', completedAt: stamp, updatedAt: new Date() })
          .where(
            inArray(
              tasks.id,
              remaining.map((task) => task.id),
            ),
          )
          .returning();

        const byId = new Map(completedTasks.map((task) => [task.id, task]));
        for (const task of remaining) {
          const written = byId.get(task.id);
          if (!written) continue;
          const step = undoFor(`/api/career/tasks/${task.id}`, task, written, TASK_COLUMNS);
          if (step) taskUndo.push(step);
        }
      }
    }

    revalidateCareer();

    const milestoneUndo = undoFor(`/api/career/milestones/${id}`, before, after, MILESTONE_COLUMNS);
    return Response.json({
      ok: true,
      milestone: after,
      completedTasks,
      // Milestone first, then its tasks: reopening the milestone before putting
      // the tasks back means no intermediate state has a done milestone with
      // open tasks under it.
      undo: [...(milestoneUndo ? [milestoneUndo] : []), ...taskUndo],
    });
  } catch (error) {
    return caught(error, 'api/career/milestones/[id] PATCH');
  }
}
