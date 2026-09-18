import { desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { v4 as uuid } from 'uuid';

import { db } from '@/lib/db';
import { wins } from '@/lib/db/schema';
import { adminOnly } from '@/lib/career/auth';
import { isCompetencyId } from '@/lib/career/types';
import { parseIsoDate, toIsoDate } from '@/lib/career/horizon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Wins — list (public) and create (admin).
 *
 * A win is an achievement nothing planned: you ran an incident, you mentored
 * someone through a promotion, you made an architecture call that stuck. The spec
 * is blunt about why these get their own table rather than being bent into a goal
 * — they are often the best promotion evidence and they never come from a goal.
 *
 * Three rules live here:
 *
 *   1. Every win carries exactly one competency. That single tag is what turns the
 *      log into a promotion packet and what makes neglect visible, so it is
 *      required rather than defaulted — a wrongly-tagged win is worse than a
 *      missing one.
 *   2. `impact_note` wants the number. The column is NOT NULL DEFAULT '' so an
 *      empty one is legal; the nudge belongs in the form, not in a 400.
 *   3. No DELETE, here or on the item route. Nothing in this app is ever deleted.
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

/**
 * Evidence links render as live anchors in the log, so the protocol is checked
 * here and not only in the form: a `javascript:` URL stored in this column would
 * be a stored-XSS vector the moment somebody clicked it.
 */
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

function today(body: Body): string {
  return optIso(body, 'today') ?? toIsoDate(new Date());
}

function revalidateCareer(): void {
  revalidatePath('/career', 'layout');
}

/* ---------------------------------------------------------------------- GET */

export async function GET(): Promise<Response> {
  try {
    const rows = await db
      .select()
      .from(wins)
      .orderBy(desc(wins.happenedOn), desc(wins.createdAt));
    return Response.json({ ok: true, wins: rows });
  } catch (error) {
    return caught(error, 'api/career/wins GET');
  }
}

/* --------------------------------------------------------------------- POST */

export async function POST(request: Request): Promise<Response> {
  const denied = await adminOnly();
  if (denied) return denied;

  try {
    const body = await readBody(request);

    const title = reqText(body, 'title', 300);

    // Spec: "Every milestone and every win tags exactly one competency."
    const competencyId = optOneOf(body, 'competencyId', isCompetencyId);
    if (!competencyId) {
      throw new FieldError(
        400,
        'invalid_field',
        'A win needs one competency. That single tag is what turns the log into a promotion packet.',
        'competencyId',
      );
    }

    const [win] = await db
      .insert(wins)
      .values({
        id: uuid(),
        title,
        // Undated by the caller means it happened today — the common case, since
        // the weekly review asks for it within a week of the thing happening.
        happenedOn: optIso(body, 'happenedOn') ?? today(body),
        competencyId,
        impactNote: optText(body, 'impactNote', 2000) ?? '',
        evidenceUrl: optEvidenceUrl(body) ?? null,
      })
      .returning();

    revalidateCareer();
    return Response.json({ ok: true, win }, { status: 201 });
  } catch (error) {
    return caught(error, 'api/career/wins POST');
  }
}
