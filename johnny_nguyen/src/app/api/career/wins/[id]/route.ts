import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { wins, type Win } from '@/lib/db/schema';
import { adminOnly } from '@/lib/career/auth';
import { isCompetencyId } from '@/lib/career/types';
import { parseIsoDate } from '@/lib/career/horizon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One win — read (public), patch (admin), and a deliberate 405 on delete.
 *
 * "Nothing is deleted" is a product rule, not a database one: the cascade in the
 * schema is a referential safety net, and this route is where the rule is actually
 * enforced. A win logged by mistake is edited, never removed — the log is only
 * worth taking into a promotion conversation if it is the whole record.
 *
 * Every mutation returns `undo` steps in the same shape the milestone route uses,
 * so a toast can put a mis-typed edit back with one click.
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

/** See wins/route.ts — evidence renders as a live anchor, so http/https only. */
function optEvidenceUrl(body: Body, key = 'evidenceUrl'): string | null | undefined {
  const value = optText(body, key, 1000);
  if (value === undefined || value === null) return value;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new FieldError(400, 'invalid_field', `${key} must be a link.`, key);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FieldError(400, 'invalid_field', `${key} must be an http or https link.`, key);
  }
  return url.toString();
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

const WIN_COLUMNS = ['title', 'happenedOn', 'competencyId', 'impactNote', 'evidenceUrl'] as const;

/* ---------------------------------------------------------------------- GET */

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const [win] = await db.select().from(wins).where(eq(wins.id, id)).limit(1);
    if (!win) return fail(404, 'not_found', 'No win with that id.');
    return Response.json({ ok: true, win });
  } catch (error) {
    return caught(error, 'api/career/wins/[id] GET');
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

    const [before] = await db.select().from(wins).where(eq(wins.id, id)).limit(1);
    if (!before) return fail(404, 'not_found', 'No win with that id.');

    const patch: Partial<Win> = {};

    if (has(body, 'title')) {
      const title = optText(body, 'title', 300);
      if (!title) throw new FieldError(400, 'invalid_field', 'A win needs a title.', 'title');
      patch.title = title;
    }
    if (has(body, 'happenedOn')) {
      const happenedOn = optIso(body, 'happenedOn');
      if (!happenedOn) {
        throw new FieldError(400, 'invalid_field', 'A win needs a date.', 'happenedOn');
      }
      patch.happenedOn = happenedOn;
    }
    const competencyId = optOneOf(body, 'competencyId', isCompetencyId);
    if (competencyId) patch.competencyId = competencyId;

    // Clearing the note back to '' is legal — the column is NOT NULL — so a win
    // whose number turned out to be wrong can lose it without losing the win.
    if (has(body, 'impactNote')) patch.impactNote = optText(body, 'impactNote', 2000) ?? '';
    if (has(body, 'evidenceUrl')) patch.evidenceUrl = optEvidenceUrl(body) ?? null;

    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: true, win: before, undo: [] });
    }

    const [after] = await db
      .update(wins)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(wins.id, id))
      .returning();

    revalidateCareer();

    const undo = undoFor(`/api/career/wins/${id}`, before, after, WIN_COLUMNS);
    return Response.json({ ok: true, win: after, undo: undo ? [undo] : [] });
  } catch (error) {
    return caught(error, 'api/career/wins/[id] PATCH');
  }
}

/* ------------------------------------------------------------------- DELETE */

/**
 * Answered rather than left to Next's bare 405, because the refusal is a product
 * decision worth stating: the log is evidence, and evidence you can quietly
 * remove is not evidence. Edit the win instead.
 */
export async function DELETE(): Promise<Response> {
  return fail(
    405,
    'not_deletable',
    'Wins are never deleted — the log is only worth anything if it is the whole record. Edit it instead.',
  );
}
