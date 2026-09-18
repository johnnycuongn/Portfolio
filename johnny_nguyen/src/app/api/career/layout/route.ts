/**
 * The dashboard's panel arrangement, stored in Postgres under `layout/default`.
 *
 * In the database rather than in browser storage on purpose: the arrangement is
 * meant to follow you from laptop to phone. Browser storage is only ever for
 * throwaway view state — which filter you last used, whether the backlog was open.
 *
 * GET is public, because the read-only `/career` tree renders the same arrangement
 * as the admin one and a layout is not a secret. PUT is admin-gated like every other
 * mutation in this app.
 */

import { eq } from 'drizzle-orm';

import { adminOnly } from '@/lib/career/auth';
import { db } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { LAYOUT_SETTINGS_KEY } from '@/lib/career/types';
import { normalizeLayout, DEFAULT_LAYOUT } from '@/app/career/_components/PanelLayout/layout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(settings)
      .where(eq(settings.key, LAYOUT_SETTINGS_KEY))
      .limit(1);
    return Response.json({ ok: true, layout: normalizeLayout(rows[0]?.value) });
  } catch (error) {
    // A layout that cannot be read is not a failure worth surfacing — the default
    // renders perfectly well, and the dashboard is more useful than an error.
    console.error('career/layout: read failed', error);
    return Response.json({ ok: true, layout: DEFAULT_LAYOUT });
  }
}

export async function PUT(request: Request) {
  const denied = await adminOnly();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'bad request' }, { status: 400 });
  }

  // Normalised before it is stored, not just before it is rendered: a row that is
  // already well-formed means the read path can never be the thing that breaks.
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const layout = normalizeLayout(input.layout ?? input);
  const now = new Date();

  try {
    await db
      .insert(settings)
      .values({ key: LAYOUT_SETTINGS_KEY, value: layout, updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: layout, updatedAt: now },
      });
    return Response.json({ ok: true, layout });
  } catch (error) {
    console.error('career/layout: write failed', error);
    return Response.json({ ok: false, error: 'could not save the layout' }, { status: 503 });
  }
}
