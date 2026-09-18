'use client';

/**
 * Every write the goal detail screen can make, in one hook.
 *
 * The spec's rule for this screen is "friction scales with rarity", and this file
 * is where that rule is either kept or broken. So:
 *
 *   - Ticking a task is one PATCH and an undo toast. No confirmation, ever.
 *   - Starting a task is one PATCH. No confirmation.
 *   - Adding a milestone or a task is one POST. No confirmation.
 *   - The ONLY thing that asks something of you is evidence on a milestone, and
 *     that lives in EvidenceCapture, not here.
 *
 * Nothing is deleted. `untickTask` and `reopenMilestone` move a row backwards;
 * they never remove it, and reopening a milestone deliberately leaves its
 * evidence in place — you earned it once.
 *
 * Reads come from the server component. After a successful write this calls
 * `router.refresh()`, so the rendered numbers always come from Postgres rather
 * than from a client-side guess that can drift out of step with the rollup.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuid } from 'uuid';

import type { Effort, IsoDate, ItemStatus } from '@/lib/career/types';

/* ------------------------------------------------------------------ endpoints */

/**
 * The routes this screen talks to. The goal / milestone / task routes belong to
 * the master-table agent; only `reorderMilestones` is ours. They are collected
 * here so that if their paths ever differ from this convention, the fix is one
 * object rather than a hunt through three components.
 */
export const CAREER_API = {
  goal: (id: string) => `/api/career/goals/${encodeURIComponent(id)}`,
  milestones: '/api/career/milestones',
  milestone: (id: string) => `/api/career/milestones/${encodeURIComponent(id)}`,
  tasks: '/api/career/tasks',
  task: (id: string) => `/api/career/tasks/${encodeURIComponent(id)}`,
  reorderMilestones: (goalId: string) =>
    `/api/career/goals/${encodeURIComponent(goalId)}/milestones/reorder`,
} as const;

/* ---------------------------------------------------------------------- dates */

/**
 * Today as `YYYY-MM-DD`, read off the *local* calendar.
 *
 * Deliberately not `toIsoDate(new Date())` from horizon.ts, which reads UTC
 * fields. In Sydney (UTC+10/+11) a task ticked at 9am Monday is still Sunday in
 * UTC, and it would land on the wrong heatmap cell and the wrong day in the
 * achievement log. "Completed today" has to mean the day the person is living in.
 */
export function todayIso(now: Date = new Date()): IsoDate {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/* ------------------------------------------------------------------- reorder */

/**
 * Move one id from `from` to `to`, returning a new array. Pure, and exported
 * because both the drag handler and the keyboard ↑/↓ controls need it.
 * Out-of-range indices return the input unchanged rather than throwing.
 */
export function moveInOrder<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/* --------------------------------------------------------------------- types */

export type EvidenceValue = {
  evidenceUrl: string | null;
  evidenceNote: string | null;
};

export type NewMilestoneInput = {
  title: string;
  /** Inherits from the goal. The add form does not ask. */
  competencyId: string;
  targetDate?: IsoDate | null;
  /** Appended to the end of the list when omitted. */
  sortOrder?: number;
};

export type NewTaskInput = {
  title: string;
  effort?: Effort;
  /** Null for a goal that holds tasks directly. */
  milestoneId?: string | null;
};

export type TaskRef = {
  id: string;
  status: ItemStatus | string;
  startedOn?: IsoDate | null;
  completedAt?: IsoDate | null;
};

export type MilestoneRef = {
  id: string;
  status: ItemStatus | string;
  completedAt?: IsoDate | null;
};

export type ToastTone = 'neutral' | 'done' | 'error';

export type GoalToast = {
  /** Changes on every toast, so an `AnimatePresence` key re-runs the entrance. */
  id: string;
  message: string;
  tone: ToastTone;
  /** Present only where the action is genuinely reversible. */
  undo: (() => void) | null;
};

export type GoalMutations = {
  /** False on the public tree — every mutator becomes a no-op returning false. */
  editable: boolean;
  /** Ids (task / milestone / goal / the literal 'order') with a write in flight. */
  isPending: (id: string) => boolean;
  busy: boolean;
  toast: GoalToast | null;
  dismissToast: () => void;
  /**
   * The milestone that has just been reached, for ~1.4s. Feed it to
   * `MilestoneFlourish`. It is a moment, not a balance: it clears itself and
   * leaves nothing behind.
   */
  celebrating: string | null;

  startTask: (task: TaskRef) => Promise<boolean>;
  tickTask: (task: TaskRef) => Promise<boolean>;
  untickTask: (task: TaskRef) => Promise<boolean>;
  addTask: (input: NewTaskInput) => Promise<string | null>;

  addMilestone: (input: NewMilestoneInput) => Promise<string | null>;
  completeMilestone: (
    milestone: MilestoneRef,
    evidence: EvidenceValue,
    options?: { remainingTaskIds?: readonly string[] },
  ) => Promise<boolean>;
  reopenMilestone: (milestone: MilestoneRef) => Promise<boolean>;
  saveEvidence: (milestoneId: string, evidence: EvidenceValue) => Promise<boolean>;

  reorderMilestones: (orderedIds: readonly string[]) => Promise<boolean>;
};

/* ------------------------------------------------------------------ transport */

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function send(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* an empty body is fine on a 2xx */
  }

  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : 'failed';
    throw new ApiError(response.status, error);
  }
  return payload;
}

/** What the person reads. Never the raw server code. */
function humanError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Editing is locked. Unlock with the code to make changes.';
    if (error.status === 0) return 'No connection — nothing was saved.';
    if (error.status === 409) return 'This list changed somewhere else. Reload to see it.';
    if (error.status === 400 && error.message === 'evidence_required')
      return 'A milestone needs a link or a note before it can be marked reached.';
  }
  return 'That did not save, so nothing changed.';
}

const UNDO_MS = 8000;
const FLOURISH_MS = 1400;

/* ---------------------------------------------------------------------- hook */

export function useGoalMutations({
  goalId,
  editable = true,
}: {
  goalId: string;
  editable?: boolean;
}): GoalMutations {
  const router = useRouter();
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [toast, setToast] = useState<GoalToast | null>(null);
  const [celebrating, setCelebrating] = useState<string | null>(null);

  const timers = useRef<{ toast?: ReturnType<typeof setTimeout>; flourish?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    const held = timers.current;
    return () => {
      if (held.toast) clearTimeout(held.toast);
      if (held.flourish) clearTimeout(held.flourish);
    };
  }, []);

  const dismissToast = useCallback(() => {
    if (timers.current.toast) clearTimeout(timers.current.toast);
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone, undo: (() => void) | null) => {
    if (timers.current.toast) clearTimeout(timers.current.toast);
    const entry: GoalToast = { id: uuid(), message, tone, undo };
    setToast(entry);
    timers.current.toast = setTimeout(() => {
      setToast((current) => (current?.id === entry.id ? null : current));
    }, UNDO_MS);
  }, []);

  const celebrate = useCallback((milestoneId: string) => {
    if (timers.current.flourish) clearTimeout(timers.current.flourish);
    setCelebrating(milestoneId);
    timers.current.flourish = setTimeout(() => {
      setCelebrating((current) => (current === milestoneId ? null : current));
    }, FLOURISH_MS);
  }, []);

  const mark = useCallback((id: string, on: boolean) => {
    setPending((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /**
   * One write. Returns the parsed body on success and null on failure, having
   * already shown the person why. `key` is the id the UI dims while it is out.
   */
  const run = useCallback(
    async (key: string, url: string, method: 'POST' | 'PATCH', body: unknown): Promise<unknown | null> => {
      if (!editable) {
        showToast('This view is read-only.', 'error', null);
        return null;
      }
      mark(key, true);
      try {
        const result = await send(url, method, body);
        router.refresh();
        return result ?? {};
      } catch (error) {
        showToast(humanError(error), 'error', null);
        return null;
      } finally {
        mark(key, false);
      }
    },
    [editable, mark, router, showToast],
  );

  const isPending = useCallback((id: string) => pending.has(id), [pending]);

  /* ------------------------------------------------------------------ tasks */

  const patchTask = useCallback(
    (task: TaskRef, patch: Record<string, unknown>) =>
      run(task.id, CAREER_API.task(task.id), 'PATCH', patch),
    [run],
  );

  const startTask = useCallback<GoalMutations['startTask']>(
    async (task) => {
      const result = await patchTask(task, {
        status: 'doing',
        // Only stamped the first time, so picking a task back up does not rewrite
        // the day you actually started it.
        startedOn: task.startedOn ?? todayIso(),
      });
      return result !== null;
    },
    [patchTask],
  );

  /** One click, no confirmation, undo in the toast. This is the hot path. */
  const tickTask = useCallback<GoalMutations['tickTask']>(
    async (task) => {
      const previousStatus = task.status === 'done' ? 'todo' : task.status;
      const previousCompletedAt = task.completedAt ?? null;

      const result = await patchTask(task, { status: 'done', completedAt: todayIso() });
      if (result === null) return false;

      showToast('Done.', 'done', () => {
        dismissToast();
        void run(task.id, CAREER_API.task(task.id), 'PATCH', {
          status: previousStatus,
          completedAt: previousCompletedAt,
        });
      });
      return true;
    },
    [dismissToast, patchTask, run, showToast],
  );

  const untickTask = useCallback<GoalMutations['untickTask']>(
    async (task) => {
      const result = await patchTask(task, { status: 'todo', completedAt: null });
      return result !== null;
    },
    [patchTask],
  );

  const addTask = useCallback<GoalMutations['addTask']>(
    async (input) => {
      const title = input.title.trim();
      if (!title) return null;
      const id = uuid();
      const result = await run(id, CAREER_API.tasks, 'POST', {
        id,
        goalId,
        milestoneId: input.milestoneId ?? null,
        title,
        status: 'todo',
        effort: input.effort ?? 'M',
      });
      return result === null ? null : id;
    },
    [goalId, run],
  );

  /* ------------------------------------------------------------- milestones */

  const addMilestone = useCallback<GoalMutations['addMilestone']>(
    async (input) => {
      const title = input.title.trim();
      if (!title) return null;
      const id = uuid();
      const result = await run(id, CAREER_API.milestones, 'POST', {
        id,
        goalId,
        title,
        competencyId: input.competencyId,
        status: 'todo',
        sortOrder: input.sortOrder ?? null,
        targetDate: input.targetDate ?? null,
      });
      return result === null ? null : id;
    },
    [goalId, run],
  );

  /**
   * The one deliberate piece of friction on this screen — and even here the
   * friction is the evidence itself, not a confirmation. Both evidence fields
   * empty is refused before the request leaves, because the database CHECK would
   * refuse it anyway and a 500 is a worse way to learn that.
   *
   * Spec: "A milestone can also be marked done directly, which completes its
   * remaining tasks." Those task PATCHes run first, so a mid-flight failure
   * leaves the milestone open rather than done-over-unfinished-tasks.
   */
  const completeMilestone = useCallback<GoalMutations['completeMilestone']>(
    async (milestone, evidence, options) => {
      const url = evidence.evidenceUrl?.trim() || null;
      const note = evidence.evidenceNote?.trim() || null;
      if (!url && !note) {
        showToast('A link or a note — one of the two is what makes this worth keeping.', 'error', null);
        return false;
      }

      if (!editable) {
        showToast('This view is read-only.', 'error', null);
        return false;
      }

      mark(milestone.id, true);
      try {
        const remaining = options?.remainingTaskIds ?? [];
        if (remaining.length > 0) {
          const completedAt = todayIso();
          await Promise.all(
            remaining.map((taskId) =>
              send(CAREER_API.task(taskId), 'PATCH', { status: 'done', completedAt }),
            ),
          );
        }

        await send(CAREER_API.milestone(milestone.id), 'PATCH', {
          status: 'done',
          completedAt: todayIso(),
          evidenceUrl: url,
          evidenceNote: note,
        });

        router.refresh();
        celebrate(milestone.id);
        showToast('Milestone reached.', 'done', null);
        return true;
      } catch (error) {
        showToast(humanError(error), 'error', null);
        return false;
      } finally {
        mark(milestone.id, false);
      }
    },
    [celebrate, editable, mark, router, showToast],
  );

  /** Moves it back to todo. The evidence stays — you did reach it once. */
  const reopenMilestone = useCallback<GoalMutations['reopenMilestone']>(
    async (milestone) => {
      const result = await run(milestone.id, CAREER_API.milestone(milestone.id), 'PATCH', {
        status: 'todo',
        completedAt: null,
      });
      return result !== null;
    },
    [run],
  );

  const saveEvidence = useCallback<GoalMutations['saveEvidence']>(
    async (milestoneId, evidence) => {
      const result = await run(milestoneId, CAREER_API.milestone(milestoneId), 'PATCH', {
        evidenceUrl: evidence.evidenceUrl?.trim() || null,
        evidenceNote: evidence.evidenceNote?.trim() || null,
      });
      if (result !== null) showToast('Evidence saved.', 'neutral', null);
      return result !== null;
    },
    [run, showToast],
  );

  const reorderMilestones = useCallback<GoalMutations['reorderMilestones']>(
    async (orderedIds) => {
      if (orderedIds.length === 0) return true;
      const result = await run('order', CAREER_API.reorderMilestones(goalId), 'POST', {
        ids: [...orderedIds],
      });
      return result !== null;
    },
    [goalId, run],
  );

  return {
    editable,
    isPending,
    busy: pending.size > 0,
    toast,
    dismissToast,
    celebrating,
    startTask,
    tickTask,
    untickTask,
    addTask,
    addMilestone,
    completeMilestone,
    reopenMilestone,
    saveEvidence,
    reorderMilestones,
  };
}

export default useGoalMutations;

/* ------------------------------------------------------------------ the wiring */

/**
 * One hook instance for the whole screen, shared by every row control.
 *
 * The goal detail screen is assembled server-side and takes its editing
 * affordances as `slots` — per-row `ReactNode`s that a server component cannot
 * give client state to. Without a context each row would end up calling
 * `useGoalMutations` for itself, and the screen would have one toast queue per
 * task and one pending set per milestone: tick two things quickly and you would
 * get two toasts stacked, each able to undo only its own row.
 *
 * So the page wraps the screen in this provider and drops context-reading
 * controls into the slots:
 *
 *     <GoalEditingProvider goalId={goal.id} editable>
 *       <GoalDetailScreen data={data} editable basePath="/career/admin" slots={…} />
 *       <GoalEditingToast />
 *     </GoalEditingProvider>
 *
 * Written with `createElement` rather than JSX only because this file is `.ts`.
 */
const GoalEditingContext = createContext<GoalMutations | null>(null);

export function GoalEditingProvider({
  goalId,
  editable = true,
  children,
}: {
  goalId: string;
  editable?: boolean;
  children: ReactNode;
}) {
  const mutations = useGoalMutations({ goalId, editable });
  return createElement(GoalEditingContext.Provider, { value: mutations }, children);
}

/** Throws outside the provider, because a silently inert control is worse. */
export function useGoalEditing(): GoalMutations {
  const value = useContext(GoalEditingContext);
  if (!value) {
    throw new Error('useGoalEditing() must be called inside <GoalEditingProvider>.');
  }
  return value;
}
