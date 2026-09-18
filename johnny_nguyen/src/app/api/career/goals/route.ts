import { asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { v4 as uuid } from 'uuid';

import { db } from '@/lib/db';
import { goals } from '@/lib/db/schema';
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
 * Goals — list (public) and create (admin).
 *
 * There is no DELETE here and there never will be. "Nothing is ever deleted" is a
 * product rule, not a preference: dropping a goal is `status = 'dropped'` plus a
 * close note, which keeps the honest record of what was abandoned and why.
 *
 * Every rule the spec states is enforced HERE, not only in the UI — the admin
 * screens are a convenience, the API is the boundary.
 */

/* ------------------------------------------------------------ route preamble --
 * A route.ts may only export handlers and the Next config constants, so these
 * helpers are duplicated across the six career mutation routes rather than
 * imported from a shared module. Kept deliberately small for that reason.
 * ---------------------------------------------------------------------------- */

type Body = Record<string, unknown>;

const has = (body: Body, key: string) => Object.prototype.hasOwnProperty.call(body, key);

/** A validation failure carrying the exact status, code and message to return. */
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

/** Present-and-a-string, trimmed. Empty string reads as null. `undefined` = absent. */
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

/** A `YYYY-MM-DD` string, rejected rather than coerced when malformed. */
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

/**
 * The calendar day to stamp on started/closed/completed columns.
 *
 * The client sends its own local date, because a tick at 8am in Melbourne is
 * 22:00 UTC the day before, and the heatmap would record it on the wrong square.
 * UTC is the fallback when nothing is sent.
 */
function today(body: Body): string {
  return optIso(body, 'today') ?? toIsoDate(new Date());
}

/** The read-only screens are served from `/career`; keep them from going stale. */
function revalidateCareer(): void {
  revalidatePath('/career', 'layout');
}

/* ------------------------------------------------------------------- horizons */

type HorizonFields = {
  horizonType: string;
  horizonValue: string | null;
  customStart: string | null;
  customEnd: string | null;
};

/**
 * Forces the four horizon columns into a shape the CHECK constraints accept, and
 * rejects a value that cannot produce a target date. `target_date` is never
 * stored — it is derived from this pair — so an uninterpretable value here would
 * silently become a goal that can never appear on the timeline.
 */
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

  // monthly | quarterly | yearly — the value defaults to the current period,
  // which is the spec's "set a type and the value defaults to the current one".
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

/**
 * Every goal. Public and read-only — the whole dashboard is readable by anyone
 * with the link, so there is nothing here the /career tree does not already show.
 */
export async function GET(): Promise<Response> {
  try {
    const rows = await db.select().from(goals).orderBy(asc(goals.createdAt));
    return Response.json({ ok: true, goals: rows });
  } catch (error) {
    return caught(error, 'api/career/goals GET');
  }
}

/* --------------------------------------------------------------------- POST */

export async function POST(request: Request): Promise<Response> {
  const denied = await adminOnly();
  if (denied) return denied;

  try {
    const body = await readBody(request);
    const stamp = today(body);
    const on = parseIsoDate(stamp) ?? new Date();

    const title = reqText(body, 'title', 300);
    // Required, and the one piece of friction the spec asks for on creation:
    // "goals without one rot in the list".
    const why = reqText(body, 'why', 600);

    const competencyId = optOneOf(body, 'competencyId', isCompetencyId);
    if (!competencyId) {
      throw new FieldError(400, 'invalid_field', 'competencyId is required.', 'competencyId');
    }

    const kind = optOneOf(body, 'kind', isGoalKind) ?? 'skill';
    const status = optOneOf(body, 'status', isGoalStatus) ?? 'backlog';

    const horizon = normaliseHorizon(
      {
        horizonType: optOneOf(body, 'horizonType', isHorizonType) ?? 'none',
        horizonValue: optText(body, 'horizonValue', 16) ?? null,
        customStart: optIso(body, 'customStart') ?? null,
        customEnd: optIso(body, 'customEnd') ?? null,
      },
      on,
    );

    const closeNote = optText(body, 'closeNote', 600) ?? null;
    if (status === 'dropped' && !closeNote) {
      throw new FieldError(
        422,
        'close_note_required',
        'Dropping a goal needs a reason — that is the whole point of keeping it.',
        'closeNote',
      );
    }

    // One level of nesting only. A parent that already has a parent would make
    // this goal a grandchild, and the spec is explicit that three levels means
    // the goal is too big.
    const parentGoalId = optText(body, 'parentGoalId', 64) ?? null;
    if (parentGoalId) {
      const [parent] = await db
        .select({ id: goals.id, parentGoalId: goals.parentGoalId })
        .from(goals)
        .where(eq(goals.id, parentGoalId))
        .limit(1);
      if (!parent) {
        throw new FieldError(422, 'parent_not_found', 'That parent goal does not exist.', 'parentGoalId');
      }
      if (parent.parentGoalId) {
        throw new FieldError(
          422,
          'nesting_too_deep',
          'Goals nest one level only. That parent already rolls up into another goal.',
          'parentGoalId',
        );
      }
    }

    const startedOn =
      optIso(body, 'startedOn') ?? (status === 'active' ? stamp : null);
    const closedOn =
      optIso(body, 'closedOn') ?? (status === 'done' || status === 'dropped' ? stamp : null);

    const [goal] = await db
      .insert(goals)
      .values({
        id: uuid(),
        title,
        why,
        ...horizon,
        parentGoalId,
        kind,
        status,
        competencyId,
        startedOn,
        closedOn,
        closeNote,
        estHours: optNumber(body, 'estHours') ?? null,
        cost: optNumber(body, 'cost') ?? null,
      })
      .returning();

    revalidateCareer();
    // No undo on a create: nothing is ever deleted, so the inverse of "add a
    // goal" would be a lie. Getting it wrong is a one-field edit instead.
    return Response.json({ ok: true, goal }, { status: 201 });
  } catch (error) {
    return caught(error, 'api/career/goals POST');
  }
}
