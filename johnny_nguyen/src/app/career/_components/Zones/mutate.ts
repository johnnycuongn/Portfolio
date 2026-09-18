/**
 * The two mutations the dashboard zones make, as one-line client helpers.
 *
 * These call the item routes — `/api/career/tasks/[id]` and `/api/career/goals/[id]`
 * — which belong to the master-table and goal-detail screens, not to this one. Two
 * things about their contract shape this file:
 *
 *   1. **The route owns the side effects.** Ticking a task done stamps
 *      `completed_at` server-side; starting one stamps `started_on`; moving a goal
 *      into Active stamps its start date. So these helpers send the status and
 *      nothing else — a client that also guessed at the dates would be a second
 *      source of truth for them, and the two would eventually disagree.
 *   2. **The route returns a real inverse.** Its `undo` is a list of PATCH steps
 *      built from the row as it actually was. Undo therefore writes the old values
 *      back rather than repainting the screen and hoping.
 *
 * Nothing here throws. The caller's job on failure is always the same: put the row
 * back the way it was and say so quietly, because a tick that did not save must
 * never look like one that did.
 */

export type UndoStep = { method: string; path: string; body: Record<string, unknown> };

export type MutationResult = { ok: boolean; undo: UndoStep[] };

const FAILED: MutationResult = { ok: false, undo: [] };

async function patch(path: string, body: unknown): Promise<MutationResult> {
  try {
    const response = await fetch(path, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) return FAILED;
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; undo?: unknown }
      | null;
    if (!payload || payload.ok !== true) return FAILED;
    return { ok: true, undo: Array.isArray(payload.undo) ? (payload.undo as UndoStep[]) : [] };
  } catch {
    return FAILED;
  }
}

/** Tick a task done, or start it. The route stamps the dates. */
export function setTaskStatus(
  id: string,
  status: 'todo' | 'doing' | 'done',
): Promise<MutationResult> {
  return patch(`/api/career/tasks/${encodeURIComponent(id)}`, { status });
}

/** Move a backlog goal into Active — the only action a backlog row has. */
export function setGoalStatus(
  id: string,
  status: 'active' | 'paused' | 'backlog',
): Promise<MutationResult> {
  return patch(`/api/career/goals/${encodeURIComponent(id)}`, { status });
}

/**
 * Replays the inverse the route handed back. All-or-nothing in reporting only: a
 * partial undo is still better than none, but the caller is told it did not fully
 * land so it can say so rather than claiming the row is back.
 */
export async function applyUndo(steps: readonly UndoStep[]): Promise<boolean> {
  if (steps.length === 0) return false;
  let allOk = true;
  for (const step of steps) {
    const result = await patch(step.path, step.body);
    if (!result.ok) allOk = false;
  }
  return allOk;
}
