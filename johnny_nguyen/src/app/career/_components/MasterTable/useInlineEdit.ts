'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The write side of the master table, in one hook.
 *
 * The master table is where the Sunday-evening tidying pass happens, so the
 * design target is: one click changes one field, the row updates immediately,
 * nothing asks "are you sure", and anything you did by accident is one click
 * back. Three things make that work:
 *
 *  - **Optimistic overrides.** A committed value is merged over the row the
 *    moment the server confirms it, so the cell never flickers back to the old
 *    value while the RSC payload is on its way. The override is dropped once
 *    `router.refresh()` has actually landed (that is what the transition's
 *    pending flag is for), not on a timer.
 *
 *  - **Real undo.** The server returns the inverse request — the exact PATCH
 *    that restores every column it changed, including the tasks a milestone
 *    completed on its way to done. Undo replays those requests. It is a genuine
 *    round trip, so if it succeeds, the database really did go back; if it
 *    fails, you are told rather than shown a lie.
 *
 *  - **Errors belong to a cell.** A 422 ("this milestone needs evidence") is
 *    surfaced on the cell that caused it, not as a page-level banner, because
 *    the fix is always in that cell.
 */

/* -------------------------------------------------------------------- types */

export type CareerEntity = 'goals' | 'milestones' | 'tasks';

/** A request the client can replay verbatim to undo a write. Built by the API. */
export type UndoStep = {
  method: 'PATCH' | 'POST';
  path: string;
  body: Record<string, unknown>;
};

export type MutationError = {
  status: number;
  /** Machine code: `evidence_required`, `close_note_required`, `unauthorized`, … */
  error: string;
  /** Sentence meant to be shown to a person, as written by the route. */
  message: string;
  /** The field the message is about, when the route knows. */
  field?: string;
};

export type MutationResult =
  | { ok: true; payload: Record<string, unknown>; undo: UndoStep[] }
  | { ok: false; error: MutationError };

export type UndoToastState = {
  /** Changes on every new toast, so the entrance animation re-runs. */
  key: number;
  message: string;
  steps: UndoStep[];
  running: boolean;
  failed: boolean;
};

export type InlineEditOptions = {
  /** False on the public tree: mutations short-circuit instead of collecting 401s. */
  editable?: boolean;
  /** How long the undo toast stays. Zero keeps it until dismissed. */
  toastMs?: number;
};

export type MutateOptions = {
  /**
   * Which row the spinner and any error belong to. Defaults to the entity id,
   * but a cell can pass `${id}:status` to scope the error to one cell.
   */
  scope?: string;
  /** Toast copy. Omit to skip the toast entirely (edits that are their own undo). */
  undoLabel?: string;
};

export type InlineEditController = {
  editable: boolean;
  /** True while any request or refresh is in flight. */
  busy: boolean;
  patch: (
    entity: CareerEntity,
    id: string,
    body: Record<string, unknown>,
    options?: MutateOptions,
  ) => Promise<MutationResult>;
  create: (
    entity: CareerEntity,
    body: Record<string, unknown>,
    options?: MutateOptions,
  ) => Promise<MutationResult>;
  /** Convenience for the commonest edit of all. */
  setStatus: (
    entity: CareerEntity,
    id: string,
    status: string,
    options?: MutateOptions & { extra?: Record<string, unknown> },
  ) => Promise<MutationResult>;
  isPending: (scope: string) => boolean;
  errorFor: (scope: string) => MutationError | null;
  clearError: (scope: string) => void;
  /** Merges any confirmed-but-not-yet-refetched values over a row. */
  withOverrides: <T extends { id: string }>(row: T) => T;
  toast: UndoToastState | null;
  runUndo: () => Promise<void>;
  dismissToast: () => void;
};

/* ---------------------------------------------------------------- utilities */

/**
 * Today as the *browser's* calendar day.
 *
 * Sent with every mutation because the server would otherwise stamp UTC: a task
 * ticked at 8am in Melbourne is 22:00 UTC the day before, and the activity
 * heatmap would shade the wrong square. `toISOString()` is deliberately not used
 * here — it converts to UTC, which is the exact bug.
 */
export function localToday(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isRow(value: unknown): value is Record<string, unknown> & { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

/**
 * Every row a mutation response carries, whatever shape it took: the entity
 * itself, plus the tasks a milestone completed on its way to done.
 */
function rowsIn(payload: Record<string, unknown>): Array<Record<string, unknown> & { id: string }> {
  const rows: Array<Record<string, unknown> & { id: string }> = [];
  for (const key of ['goal', 'milestone', 'task']) {
    const value = payload[key];
    if (isRow(value)) rows.push(value);
  }
  const completed = payload['completedTasks'];
  if (Array.isArray(completed)) {
    for (const value of completed) if (isRow(value)) rows.push(value);
  }
  return rows;
}

function undoStepsIn(payload: Record<string, unknown>): UndoStep[] {
  const steps = payload['undo'];
  if (!Array.isArray(steps)) return [];
  return steps.filter(
    (step): step is UndoStep =>
      typeof step === 'object' &&
      step !== null &&
      typeof (step as UndoStep).path === 'string' &&
      typeof (step as UndoStep).body === 'object',
  );
}

const OFFLINE: MutationError = {
  status: 0,
  error: 'offline',
  message: 'That did not reach the server. Nothing was changed.',
};

const READ_ONLY: MutationError = {
  status: 401,
  error: 'unauthorized',
  message: 'This view is read-only. Open the admin screens to edit.',
};

/** The pending-scope undo replays under, so `busy` covers it like any write. */
const UNDO_SCOPE = 'undo';

/* -------------------------------------------------------------------- hook */

export function useInlineEdit(options: InlineEditOptions = {}): InlineEditController {
  const { editable = true, toastMs = 7000 } = options;

  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

  const [overrides, setOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [pending, setPending] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, MutationError>>({});
  const [toast, setToast] = useState<UndoToastState | null>(null);

  const toastKey = useRef(0);

  /**
   * How many writes are outstanding. State, not a ref, deliberately: the effect
   * below has to re-run when the last one settles, and a ref cannot wake it.
   */
  const inFlight = Object.keys(pending).length;

  /**
   * Overrides exist only to bridge the gap between "the server said yes" and
   * "the server components have re-rendered with it". Once nothing is in flight
   * and the refresh has landed, the real data is authoritative again.
   */
  useEffect(() => {
    if (isRefreshing || inFlight > 0) return;
    setOverrides((current) => (Object.keys(current).length === 0 ? current : {}));
  }, [isRefreshing, inFlight]);

  useEffect(() => {
    if (!toast || toastMs <= 0 || toast.running) return;
    const timer = setTimeout(() => setToast((current) => (current === toast ? null : current)), toastMs);
    return () => clearTimeout(timer);
  }, [toast, toastMs]);

  const mark = useCallback((scope: string, delta: number) => {
    setPending((current) => {
      const next = { ...current };
      const count = (next[scope] ?? 0) + delta;
      if (count > 0) next[scope] = count;
      else delete next[scope];
      return next;
    });
  }, []);

  const absorb = useCallback((payload: Record<string, unknown>) => {
    const rows = rowsIn(payload);
    if (rows.length === 0) return;
    setOverrides((current) => {
      const next = { ...current };
      for (const row of rows) next[row.id] = { ...next[row.id], ...row };
      return next;
    });
  }, []);

  /** One request. Returns the parsed envelope, never throws. */
  const send = useCallback(
    async (
      method: 'PATCH' | 'POST',
      path: string,
      body: Record<string, unknown>,
    ): Promise<MutationResult> => {
      let response: Response;
      try {
        response = await fetch(path, {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ today: localToday(), ...body }),
        });
      } catch {
        return { ok: false, error: OFFLINE };
      }

      let payload: Record<string, unknown> = {};
      try {
        const parsed: unknown = await response.json();
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          payload = parsed as Record<string, unknown>;
        }
      } catch {
        /* a body-less response is still a usable status */
      }

      if (!response.ok || payload['ok'] !== true) {
        return {
          ok: false,
          error: {
            status: response.status,
            error: typeof payload['error'] === 'string' ? payload['error'] : 'server_error',
            message:
              typeof payload['message'] === 'string'
                ? payload['message']
                : response.status === 401
                  ? READ_ONLY.message
                  : 'That did not save. Nothing was changed.',
            field: typeof payload['field'] === 'string' ? payload['field'] : undefined,
          },
        };
      }

      return { ok: true, payload, undo: undoStepsIn(payload) };
    },
    [],
  );

  const run = useCallback(
    async (
      method: 'PATCH' | 'POST',
      path: string,
      body: Record<string, unknown>,
      scope: string,
      undoLabel?: string,
    ): Promise<MutationResult> => {
      if (!editable) {
        setErrors((current) => ({ ...current, [scope]: READ_ONLY }));
        return { ok: false, error: READ_ONLY };
      }

      mark(scope, 1);
      setErrors((current) => {
        if (!(scope in current)) return current;
        const next = { ...current };
        delete next[scope];
        return next;
      });

      const result = await send(method, path, body);

      mark(scope, -1);

      if (!result.ok) {
        setErrors((current) => ({ ...current, [scope]: result.error }));
        return result;
      }

      absorb(result.payload);

      if (undoLabel && result.undo.length > 0) {
        toastKey.current += 1;
        setToast({
          key: toastKey.current,
          message: undoLabel,
          steps: result.undo,
          running: false,
          failed: false,
        });
      }

      // The public /career tree was revalidated server-side; this pulls the new
      // render into the screen the edit happened on.
      startRefresh(() => router.refresh());
      return result;
    },
    [absorb, editable, mark, router, send],
  );

  const patch = useCallback<InlineEditController['patch']>(
    (entity, id, body, opts) =>
      run('PATCH', `/api/career/${entity}/${id}`, body, opts?.scope ?? id, opts?.undoLabel),
    [run],
  );

  const create = useCallback<InlineEditController['create']>(
    (entity, body, opts) =>
      run('POST', `/api/career/${entity}`, body, opts?.scope ?? `new:${entity}`, opts?.undoLabel),
    [run],
  );

  const setStatus = useCallback<InlineEditController['setStatus']>(
    (entity, id, status, opts) =>
      run(
        'PATCH',
        `/api/career/${entity}/${id}`,
        { status, ...(opts?.extra ?? {}) },
        opts?.scope ?? `${id}:status`,
        opts?.undoLabel,
      ),
    [run],
  );

  const runUndo = useCallback(async () => {
    const current = toast;
    if (!current || current.running || current.steps.length === 0) return;

    setToast({ ...current, running: true, failed: false });
    mark(UNDO_SCOPE, 1);

    let failed = false;
    // Sequential, not parallel: the milestone has to reopen before its tasks go
    // back, or the intermediate state is a done milestone with open tasks.
    for (const step of current.steps) {
      const result = await send(step.method, step.path, step.body);
      if (!result.ok) {
        failed = true;
        break;
      }
      absorb(result.payload);
    }

    mark(UNDO_SCOPE, -1);
    startRefresh(() => router.refresh());

    if (failed) {
      setToast({ ...current, running: false, failed: true });
      return;
    }
    setToast(null);
  }, [absorb, mark, router, send, toast]);

  const withOverrides = useCallback(
    <T extends { id: string }>(row: T): T => {
      const patched = overrides[row.id];
      return patched ? ({ ...row, ...patched } as T) : row;
    },
    [overrides],
  );

  const isPending = useCallback((scope: string) => (pending[scope] ?? 0) > 0, [pending]);

  const errorFor = useCallback((scope: string) => errors[scope] ?? null, [errors]);

  const clearError = useCallback((scope: string) => {
    setErrors((current) => {
      if (!(scope in current)) return current;
      const next = { ...current };
      delete next[scope];
      return next;
    });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  /**
   * One stable object. The master table hands this controller to every visible
   * cell, so a fresh identity on each render would re-render several hundred of
   * them on every keystroke in the search box.
   */
  return useMemo(
    () => ({
      editable,
      busy: isRefreshing || inFlight > 0,
      patch,
      create,
      setStatus,
      isPending,
      errorFor,
      clearError,
      withOverrides,
      toast,
      runUndo,
      dismissToast,
    }),
    [
      clearError,
      create,
      dismissToast,
      editable,
      errorFor,
      inFlight,
      isPending,
      isRefreshing,
      patch,
      runUndo,
      setStatus,
      toast,
      withOverrides,
    ],
  );
}

export default useInlineEdit;
