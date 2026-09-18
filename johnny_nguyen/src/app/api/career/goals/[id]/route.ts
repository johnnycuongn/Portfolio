import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { goals, type Goal } from '@/lib/db/schema';
import { adminOnly } from '@/lib/career/auth';
import {
  isCompetencyId,
  isGoalKind,
  isGoalStatus,
  isHorizonType,
} from '@/lib/career/types';
import {
  currentHorizonValue,
  horizonWindow,
  parseIsoDate,
  toIsoDate,
} from '@/lib/career/horizon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One goal — read (public) and patch (admin).
 *
 * Deliberately no DELETE. Dropping a goal is `PATCH { status: 'dropped',
 * closeNote }`; the row stays forever, because the record of what you abandoned
 * and why is part of the honest history the spec is built around.
 *
 * Status changes carry their own side effects, all applied here rather than in
 * the UI: first time into Active stamps `startedOn`, Done or Dropped stamps
 * `closedOn`, reopening clears it again.
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

function optNumber(body: Body, key: string): number | null | undefined {
  if (!has(body, key)) return undefined;
  const value = body[key];
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) {
    throw new FieldError(400, 'invalid_field', `${key} must be a number of zero or more.`, key);
  }
  return n;
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

/**
 * The inverse of a write, expressed as a request the client can simply replay.
 *
 * This is what makes the undo toast real rather than an optimistic illusion: the
 * server diffs the row it actually wrote against the row it actually read, and
 * hands back the patch that puts every changed column back. Derived columns
 * (`startedOn`, `closedOn`) are in the diff too, so undoing a close does not
 * leave a stale closing date behind.
 */
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

const GOAL_COLUMNS = [
  'title',
  'why',
  'horizonType',
  'horizonValue',
  'customStart',
  'customEnd',
  'parentGoalId',
  'kind',
  'status',
  'competencyId',
  'startedOn',
  'closedOn',
  'closeNote',
  'estHours',
  'cost',
] as const;

/* ------------------------------------------------------------------- horizons */

type HorizonFields = {
  horizonType: string;
  horizonValue: string | null;
  customStart: string | null;
  customEnd: string | null;
};

function normaliseHorizon(input: HorizonFields, on: Date): HorizonFields {
  const { horizonType } = input;

  if (horizonType === 'none') {
    return { horizonType, horizonValue: null, customStart: null, customEnd: null };
  }

  if (horizonType === 'custom') {
    const start = parseIsoDate(input.customStart);
    const end = parseIsoDate(input.customEnd);
    if (!start || !end) {
      throw new FieldError(
        422,
        'invalid_custom_window',
        'A custom horizon needs both a start and an end date.',
        'customEnd',
      );
    }
    if (end.getTime() < start.getTime()) {
      throw new FieldError(
        422,
        'invalid_custom_window',
        'The custom horizon ends before it starts.',
        'customEnd',
      );
    }
    return {
      horizonType,
      horizonValue: null,
      customStart: input.customStart,
      customEnd: input.customEnd,
    };
  }

  const value = input.horizonValue ?? currentHorizonValue(horizonType, on);
  if (
    !value ||
    !horizonWindow({ horizonType, horizonValue: value, customStart: null, customEnd: null })
  ) {
    throw new FieldError(
      422,
      'invalid_horizon_value',
      `"${value ?? ''}" is not a ${horizonType} period. Expected ${
        horizonType === 'monthly' ? '2026-09' : horizonType === 'quarterly' ? '2026-Q3' : '2026'
      }.`,
      'horizonValue',
    );
  }
  return { horizonType, horizonValue: value, customStart: null, customEnd: null };
}

/* ---------------------------------------------------------------------- GET */

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const [goal] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
    if (!goal) return fail(404, 'not_found', 'No goal with that id.');
    return Response.json({ ok: true, goal });
  } catch (error) {
    return caught(error, 'api/career/goals/[id] GET');
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
    const on = parseIsoDate(stamp) ?? new Date();

    const [before] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
    if (!before) return fail(404, 'not_found', 'No goal with that id.');

    const patch: Partial<Goal> = {};

    if (has(body, 'title')) {
      const title = optText(body, 'title', 300);
      if (!title) throw new FieldError(400, 'invalid_field', 'A goal needs a title.', 'title');
      patch.title = title;
    }
    if (has(body, 'why')) {
      const why = optText(body, 'why', 600);
      if (!why) {
        throw new FieldError(
          400,
          'invalid_field',
          'The why-line is what stops a goal rotting in the list — it cannot be emptied.',
          'why',
        );
      }
      patch.why = why;
    }

    const competencyId = optOneOf(body, 'competencyId', isCompetencyId);
    if (competencyId) patch.competencyId = competencyId;

    const kind = optOneOf(body, 'kind', isGoalKind);
    if (kind) patch.kind = kind;

    if (has(body, 'estHours')) patch.estHours = optNumber(body, 'estHours') ?? null;
    if (has(body, 'cost')) patch.cost = optNumber(body, 'cost') ?? null;

    // --- horizon: any one field touched re-derives all four ---------------------
    if (
      has(body, 'horizonType') ||
      has(body, 'horizonValue') ||
      has(body, 'customStart') ||
      has(body, 'customEnd')
    ) {
      const nextType = optOneOf(body, 'horizonType', isHorizonType) ?? before.horizonType;
      // Changing the type discards the old value rather than carrying a quarter
      // string into a monthly goal, which the CHECK would reject anyway.
      const typeChanged = nextType !== before.horizonType;
      const merged: HorizonFields = {
        horizonType: nextType,
        horizonValue: has(body, 'horizonValue')
          ? (optText(body, 'horizonValue', 16) ?? null)
          : typeChanged
            ? null
            : before.horizonValue,
        customStart: has(body, 'customStart')
          ? (optIso(body, 'customStart') ?? null)
          : before.customStart,
        customEnd: has(body, 'customEnd') ? (optIso(body, 'customEnd') ?? null) : before.customEnd,
      };
      Object.assign(patch, normaliseHorizon(merged, on));
    }

    // --- parent: one level, never itself ---------------------------------------
    if (has(body, 'parentGoalId')) {
      const parentGoalId = optText(body, 'parentGoalId', 64) ?? null;
      if (parentGoalId) {
        if (parentGoalId === id) {
          throw new FieldError(
            422,
            'nesting_too_deep',
            'A goal cannot roll up into itself.',
            'parentGoalId',
          );
        }
        const [parent] = await db
          .select({ id: goals.id, parentGoalId: goals.parentGoalId })
          .from(goals)
          .where(eq(goals.id, parentGoalId))
          .limit(1);
        if (!parent) {
          throw new FieldError(
            422,
            'parent_not_found',
            'That parent goal does not exist.',
            'parentGoalId',
          );
        }
        if (parent.parentGoalId) {
          throw new FieldError(
            422,
            'nesting_too_deep',
            'Goals nest one level only. That parent already rolls up into another goal.',
            'parentGoalId',
          );
        }
        // The other direction of the same rule: this goal cannot gain a parent
        // while it is itself a parent, or its children become grandchildren.
        const [child] = await db
          .select({ id: goals.id })
          .from(goals)
          .where(eq(goals.parentGoalId, id))
          .limit(1);
        if (child) {
          throw new FieldError(
            422,
            'nesting_too_deep',
            'This goal already has goals rolling up into it, so it cannot roll up into another.',
            'parentGoalId',
          );
        }
      }
      patch.parentGoalId = parentGoalId;
    }

    // --- close note, then status and its side effects ---------------------------
    if (has(body, 'closeNote')) patch.closeNote = optText(body, 'closeNote', 600) ?? null;

    const status = optOneOf(body, 'status', isGoalStatus);
    const nextStatus = status ?? before.status;
    const nextCloseNote = has(body, 'closeNote') ? (patch.closeNote ?? null) : before.closeNote;

    // Checked against the MERGED row, not just against a status change: clearing
    // the note on a goal that is already dropped breaks the same rule, and would
    // otherwise reach the database and come back as a CHECK violation.
    if (nextStatus === 'dropped' && !nextCloseNote) {
      throw new FieldError(
        422,
        'close_note_required',
        'Dropping a goal needs a reason — that is the whole point of keeping it.',
        'closeNote',
      );
    }

    if (status && status !== before.status) {
      patch.status = status;

      if (status === 'active' && !before.startedOn && !has(body, 'startedOn')) {
        patch.startedOn = stamp;
      }
      if (status === 'done' || status === 'dropped') {
        if (!has(body, 'closedOn')) patch.closedOn = before.closedOn ?? stamp;
      } else if (!has(body, 'closedOn')) {
        // Reopened. The goal is live again, so it has no closing date.
        patch.closedOn = null;
      }
    }

    // Explicit values always win over the derived ones above.
    if (has(body, 'startedOn')) patch.startedOn = optIso(body, 'startedOn') ?? null;
    if (has(body, 'closedOn')) patch.closedOn = optIso(body, 'closedOn') ?? null;

    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: true, goal: before, undo: [] });
    }

    const [after] = await db
      .update(goals)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(goals.id, id))
      .returning();

    revalidateCareer();

    const undo = undoFor(`/api/career/goals/${id}`, before, after, GOAL_COLUMNS);
    return Response.json({ ok: true, goal: after, undo: undo ? [undo] : [] });
  } catch (error) {
    return caught(error, 'api/career/goals/[id] PATCH');
  }
}
