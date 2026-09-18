import { eq, sql } from 'drizzle-orm';

import { adminOnly } from '@/lib/career/auth';
import { db } from '@/lib/db';
import { milestones } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/career/goals/[id]/milestones/reorder   { ids: string[] }
 *
 * Rewrites `sort_order` across one goal's milestones. Milestones are a narrative
 * — the order is content, not presentation — so this is a real write, guarded
 * like every other one.
 *
 * Two deliberate choices:
 *
 * 1. The body must be the goal's *complete* milestone id set, not a subset. A
 *    partial list cannot produce a clean 0..n-1 ordering, and a client working
 *    from a stale render would silently collide two rows onto one position. A
 *    mismatch is a 409 carrying the current ids, so the caller can re-render
 *    instead of guessing.
 * 2. It is one statement — an UPDATE … FROM (VALUES …) — rather than a loop of
 *    UPDATEs. The neon-http driver has no interactive transactions, so a loop
 *    that failed halfway would leave the list half-reordered. One statement is
 *    atomic without needing one.
 *
 * Nothing is created or destroyed here; `where m.goal_id = $goal` also means a
 * crafted body cannot reach another goal's rows.
 */

const MAX_MILESTONES = 500;

function bad(error: string, status: number, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, error, ...extra }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // The actual boundary. Hiding the drag handles is cosmetic.
  const denied = await adminOnly();
  if (denied) return denied;

  const { id: goalId } = await context.params;
  if (!goalId) return bad('missing_goal', 400);

  let ids: string[];
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (!Array.isArray(body?.ids)) return bad('ids_required', 400);
    if (body.ids.length > MAX_MILESTONES) return bad('too_many_ids', 400);
    if (!body.ids.every((value): value is string => typeof value === 'string' && value.length > 0)) {
      return bad('ids_must_be_strings', 400);
    }
    ids = body.ids;
  } catch {
    return bad('invalid_body', 400);
  }

  if (new Set(ids).size !== ids.length) return bad('duplicate_ids', 400);
  if (ids.length === 0) return Response.json({ ok: true, order: [] });

  try {
    const existing = await db
      .select({ id: milestones.id })
      .from(milestones)
      .where(eq(milestones.goalId, goalId));

    if (existing.length === 0) return bad('not_found', 404);

    const current = new Set(existing.map((row) => row.id));
    const sameSet = ids.length === current.size && ids.every((id) => current.has(id));
    if (!sameSet) {
      return bad('stale_order', 409, { ids: existing.map((row) => row.id) });
    }

    // (id::text, ord::integer), … — the casts matter: parameters inside a VALUES
    // list arrive with no type for Postgres to infer from.
    const tuples = sql.join(
      ids.map((id, index) => sql`(${id}::text, ${index}::integer)`),
      sql`, `,
    );

    await db.execute(sql`
      update ${milestones} as m
         set sort_order = v.ord,
             updated_at = now()
        from (values ${tuples}) as v(id, ord)
       where m.id = v.id
         and m.goal_id = ${goalId}
    `);

    return Response.json({ ok: true, order: ids });
  } catch (error) {
    console.error('api/career/goals/[id]/milestones/reorder: failed', error);
    return bad('unavailable', 503);
  }
}
