import { asc, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { v4 as uuid } from 'uuid';

import { db } from '@/lib/db';
import { goals, milestones } from '@/lib/db/schema';
import { adminOnly } from '@/lib/career/auth';
import { isCompetencyId, isItemStatus } from '@/lib/career/types';
import { parseIsoDate, toIsoDate } from '@/lib/career/horizon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Milestones — list (public) and create (admin).
 *
 * A milestone is the level that carries evidence and the level that feeds the
 * achievement log, so the one rule worth enforcing at the database boundary is
 * enforced here too: it cannot be created straight into `done` with both
 * evidence fields empty. The DB CHECK would reject it, but a CHECK violation is
 * a 500 with a Postgres string in it; this returns a 422 a person can read.
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

/** Every milestone, in the order the timeline and the goal detail draw them. */
export async function GET(): Promise<Response> {
  try {
    const rows = await db
      .select()
      .from(milestones)
      .orderBy(asc(milestones.goalId), asc(milestones.sortOrder));
    return Response.json({ ok: true, milestones: rows });
  } catch (error) {
    return caught(error, 'api/career/milestones GET');
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
      .select({ id: goals.id, competencyId: goals.competencyId })
      .from(goals)
      .where(eq(goals.id, goalId))
      .limit(1);
    if (!goal) {
      throw new FieldError(422, 'goal_not_found', 'That goal does not exist.', 'goalId');
    }

    const title = reqText(body, 'title', 300);
    const status = optOneOf(body, 'status', isItemStatus) ?? 'todo';
    const evidenceUrl = optText(body, 'evidenceUrl', 1000) ?? null;
    const evidenceNote = optText(body, 'evidenceNote', 2000) ?? null;

    if (status === 'done' && !evidenceUrl && !evidenceNote) {
      throw new FieldError(
        422,
        'evidence_required',
        'A milestone needs a link or a note before it can be done. That evidence is what makes the achievement log worth having.',
        'evidenceUrl',
      );
    }

    // Competency inherits from the goal and is overridable, per the spec.
    const competencyId = optOneOf(body, 'competencyId', isCompetencyId) ?? goal.competencyId;

    // Appended to the end of the goal's list unless the caller says otherwise.
    let sortOrder: number;
    const given = body['sortOrder'];
    if (typeof given === 'number' && Number.isFinite(given)) {
      sortOrder = Math.trunc(given);
    } else {
      const [last] = await db
        .select({ sortOrder: milestones.sortOrder })
        .from(milestones)
        .where(eq(milestones.goalId, goalId))
        .orderBy(desc(milestones.sortOrder))
        .limit(1);
      sortOrder = (last?.sortOrder ?? 0) + 1;
    }

    const [milestone] = await db
      .insert(milestones)
      .values({
        id: uuid(),
        goalId,
        title,
        sortOrder,
        status,
        competencyId,
        evidenceUrl,
        evidenceNote,
        targetDate: optIso(body, 'targetDate') ?? null,
        completedAt: optIso(body, 'completedAt') ?? (status === 'done' ? stamp : null),
      })
      .returning();

    revalidateCareer();
    return Response.json({ ok: true, milestone }, { status: 201 });
  } catch (error) {
    return caught(error, 'api/career/milestones POST');
  }
}
