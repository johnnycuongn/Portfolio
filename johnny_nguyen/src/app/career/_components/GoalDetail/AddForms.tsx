'use client';

/**
 * Editing on the goal detail screen: the row controls, the two capture forms, the
 * reorder handles, and the feedback line they all share.
 *
 * **Friction scales with rarity** is the only rule that shaped this file.
 *
 *   - Ticking a task is one press. No confirmation, no dialog, no "are you sure" —
 *     an undo that stays live for eight seconds in the toast, which is the cheaper
 *     trade in both directions.
 *   - Starting a task is one press.
 *   - Adding a milestone or a task is one visible field and an Enter key, with no
 *     dropdown for anything that can be inherited: a milestone takes its competency
 *     from its goal without asking.
 *   - The only thing that asks anything of you is evidence on a milestone, which
 *     happens a few times a month, and it lives in EvidenceCapture.
 *
 * Every form stays open after a successful add, with the field cleared and still
 * focused, because milestones and tasks arrive in small bursts rather than one at
 * a time.
 *
 * **Nothing here is a card.** These controls sit in the ruled rows of the tree, so
 * they are drawn as type and hairlines: a ghost button that is only text until you
 * reach for it, fields that are a rule and a baseline, and one filled control per
 * form for the thing you actually came to press. The only filled *colour* is on
 * "Mark reached", because that is the one button whose result is a finished thing —
 * everything else acts on work that is still open, and open work is never coloured.
 *
 * Controls read their mutators from `GoalEditingProvider` rather than taking them
 * as props: the screen is assembled server-side and hands its editing affordances
 * in as `slots`, which a server component cannot give client state to.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { EFFORTS, type Effort } from '@/lib/career/types';
import { EvidenceSheet, MilestoneFlourish } from './EvidenceCapture';
import {
  moveInOrder,
  useGoalEditing,
  type GoalToast,
  type MilestoneRef,
  type TaskRef,
} from './useGoalMutations';

/* --------------------------------------------------------------------- styles */

/* 44px and 16px on touch. Both are load-bearing rather than aesthetic: iOS Safari
   zooms the whole page when it focuses a field under 16px, and a 32px control is a
   miss waiting to happen on a moving train. Desktop tightens back to table density
   from `sm` up, where the pointer is precise and the rows are dense. */
const fieldClass =
  'box-border h-11 rounded-[3px] border border-rule bg-surface px-3 text-[16px] text-ink ' +
  'outline-none transition-colors placeholder:text-ink-faint focus:border-signal ' +
  'disabled:bg-surface-2 disabled:text-ink-faint sm:h-8 sm:text-[13px]';

/** Text until you reach for it. The resting state of every "add" affordance. */
const ghostClass =
  'inline-flex min-h-[44px] items-center gap-2 rounded-[3px] px-2 text-[13px] text-ink-muted ' +
  'transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed ' +
  'disabled:opacity-40 sm:min-h-0 sm:h-8 sm:text-[12.5px]';

/** A row control: full touch height on a phone, table height on a desktop. */
const rowButton =
  'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[3px] px-2.5 ' +
  'text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:h-7 sm:px-2';

const rowQuiet = `${rowButton} text-ink-muted hover:bg-surface-2 hover:text-ink`;
const rowOutlined = `${rowButton} border border-rule-strong text-ink hover:bg-surface-2`;

const filledClass =
  'inline-flex h-11 shrink-0 items-center justify-center rounded-[3px] bg-signal px-4 text-[14px] ' +
  'font-medium text-ink-on-signal transition-colors hover:bg-signal-hover ' +
  'disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:px-3.5 sm:text-[12.5px]';

const outlinedClass =
  'inline-flex h-11 shrink-0 items-center justify-center rounded-[3px] border border-rule-strong ' +
  'px-4 text-[14px] font-medium text-ink transition-colors hover:bg-surface-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:px-3.5 sm:text-[12.5px]';

/* ------------------------------------------------------------ add a milestone */

export type AddMilestoneFormProps = {
  /** Inherited from the goal, per the spec. The form never asks for it. */
  competencyId: string;
  /** Appended to the end of the list. Pass `milestones.length`. */
  nextSortOrder?: number;
};

export function AddMilestoneForm({ competencyId, nextSortOrder }: AddMilestoneFormProps) {
  const reduced = useReducedMotion();
  const { editable, busy, addMilestone } = useGoalEditing();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!editable) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const id = await addMilestone({
      title: trimmed,
      competencyId,
      targetDate: targetDate || null,
      sortOrder: nextSortOrder,
    });
    setSaving(false);
    if (id) {
      setTitle('');
      setTargetDate('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="border-t border-rule pt-2">
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.form
            key="form"
            onSubmit={submit}
            initial={reduced ? false : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: 0.16 }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
              }
            }}
            className="flex flex-col gap-2 py-1 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <input
              ref={inputRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving || busy}
              placeholder="A checkpoint worth telling someone about"
              aria-label="Milestone title"
              className={`w-full sm:min-w-[220px] sm:w-auto sm:flex-grow ${fieldClass}`}
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                disabled={saving || busy}
                aria-label="Target date, optional"
                title="Target date, optional"
                className={`type-condensed w-[150px] shrink-0 sm:w-[136px] ${fieldClass}`}
              />
              <button
                type="submit"
                disabled={!title.trim() || saving || busy}
                className={filledClass}
              >
                {saving ? 'Adding' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`${ghostClass} ml-auto sm:ml-0`}
              >
                Done adding
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.button
            key="ghost"
            type="button"
            onClick={() => setOpen(true)}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16 }}
            className={`${ghostClass} -ml-2`}
          >
            <Plus />
            Add a milestone
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------- add a task */

export type AddTaskFormProps = {
  /** Null for a goal that holds its tasks directly, with no milestones. */
  milestoneId?: string | null;
  placeholder?: string;
  /** Start expanded — useful directly under a milestone that has no tasks yet. */
  startOpen?: boolean;
};

export function AddTaskForm({
  milestoneId = null,
  placeholder = 'Something you can finish inside a week',
  startOpen = false,
}: AddTaskFormProps) {
  const reduced = useReducedMotion();
  const { editable, busy, addTask } = useGoalEditing();
  const [open, setOpen] = useState(startOpen);
  const [title, setTitle] = useState('');
  // Remembered between adds: a burst of tasks is usually a burst of one size.
  const [effort, setEffort] = useState<Effort>('M');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!editable) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const id = await addTask({ title: trimmed, effort, milestoneId });
    setSaving(false);
    if (id) {
      setTitle('');
      inputRef.current?.focus();
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${ghostClass} -ml-2`}>
        <Plus />
        Add a task
      </button>
    );
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={reduced ? false : { opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
        }
      }}
      className="flex flex-col gap-2 py-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <input
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={saving || busy}
        placeholder={placeholder}
        aria-label="Task title"
        className={`w-full sm:min-w-[180px] sm:w-auto sm:flex-grow ${fieldClass}`}
      />

      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Effort">
          {EFFORTS.map((size) => {
            const on = size === effort;
            return (
              <button
                key={size}
                type="button"
                onClick={() => setEffort(size)}
                aria-pressed={on}
                title={size === 'S' ? 'Small' : size === 'M' ? 'Medium' : 'Large'}
                className={`type-condensed h-11 w-11 rounded-[3px] border text-[13px] transition-colors sm:h-8 sm:w-8 sm:text-[11.5px] ${
                  on
                    ? 'border-ink bg-ink text-ground'
                    : 'border-rule bg-surface text-ink-faint hover:border-rule-strong hover:text-ink-muted'
                }`}
              >
                {size}
              </button>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={!title.trim() || saving || busy}
          className={outlinedClass}
        >
          {saving ? 'Adding' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`${ghostClass} ml-auto sm:ml-0`}
        >
          Done adding
        </button>
      </div>
    </motion.form>
  );
}

/* -------------------------------------------------------------- task controls */

/**
 * The per-task row slot: start it, tick it, or put it back.
 *
 * Tree draws the checkbox itself and draws it inert, so this is the live control.
 * No confirmation on any of the three — the undo in the toast is the way back, and
 * `untickTask` means even a missed undo costs one press.
 */
export function TaskRowControls({ task }: { task: TaskRef }) {
  const { editable, isPending, startTask, tickTask, untickTask } = useGoalEditing();
  if (!editable) return null;

  const pending = isPending(task.id);
  const done = task.status === 'done';
  const doing = task.status === 'doing';

  if (done) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => void untickTask(task)}
        className={rowQuiet}
      >
        Reopen
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      {doing ? null : (
        <button
          type="button"
          disabled={pending}
          onClick={() => void startTask(task)}
          className={rowQuiet}
        >
          Start
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => void tickTask(task)}
        className={rowOutlined}
      >
        <Check />
        Done
      </button>
    </span>
  );
}

/* --------------------------------------------------------- milestone controls */

export type MilestoneRowControlsProps = {
  milestone: MilestoneRef & { title: string; evidenceUrl?: string | null; evidenceNote?: string | null };
  /** This goal's tasks. Marking a milestone reached completes the ones left under it. */
  tasks: readonly { id: string; milestoneId: string | null; status: string }[];
  index?: number;
  /** Pass the full ordered milestone list to get the reorder handles. */
  ordered?: readonly { id: string }[];
};

/**
 * The per-milestone slot. One button until you press it, then the evidence form —
 * inline on a desktop, a keyboard-aware sheet on a phone.
 *
 * Marking it reached is the only place in the app that asks for something, and the
 * ask is the evidence itself, never a confirmation. When it lands, the flourish
 * sweeps the row once and is gone.
 */
export function MilestoneRowControls({
  milestone,
  tasks,
  index,
  ordered,
}: MilestoneRowControlsProps) {
  const {
    editable,
    isPending,
    celebrating,
    completeMilestone,
    reopenMilestone,
    saveEvidence,
  } = useGoalEditing();
  const [capturing, setCapturing] = useState(false);
  const [editing, setEditing] = useState(false);

  const close = useCallback(() => {
    setCapturing(false);
    setEditing(false);
  }, []);

  if (!editable) return null;

  const pending = isPending(milestone.id);
  const reached = milestone.status === 'done';
  const remainingTaskIds = tasks
    .filter((task) => task.milestoneId === milestone.id && task.status !== 'done')
    .map((task) => task.id);

  return (
    <div className="flex flex-col">
      <MilestoneFlourish active={celebrating === milestone.id}>
        <div className="flex flex-wrap items-center gap-2">
          {reached ? (
            <>
              <button
                type="button"
                className={outlinedClass}
                disabled={pending}
                onClick={() => {
                  setEditing((current) => !current);
                  setCapturing(false);
                }}
              >
                {editing ? 'Close' : 'Edit evidence'}
              </button>
              <button
                type="button"
                className={ghostClass}
                disabled={pending}
                onClick={() => void reopenMilestone(milestone)}
              >
                Reopen
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={filledClass}
                disabled={pending}
                onClick={() => {
                  setCapturing((current) => !current);
                  setEditing(false);
                }}
              >
                {capturing ? 'Close' : 'Mark reached'}
              </button>
              {remainingTaskIds.length > 0 ? (
                <span className="text-[12px] text-ink-muted">
                  {remainingTaskIds.length === 1
                    ? 'The one task still open is ticked with it.'
                    : `The ${remainingTaskIds.length} tasks still open are ticked with it.`}
                </span>
              ) : null}
            </>
          )}

          {ordered && typeof index === 'number' ? (
            <>
              <span className="flex-grow" />
              <MilestoneReorderControls index={index} ordered={ordered} />
            </>
          ) : null}
        </div>
      </MilestoneFlourish>

      <EvidenceSheet
        open={capturing}
        milestoneTitle={milestone.title}
        mode="capture"
        busy={pending}
        onSubmit={async (value) => {
          const ok = await completeMilestone(milestone, value, { remainingTaskIds });
          if (ok) close();
        }}
        onCancel={close}
      />

      <EvidenceSheet
        open={editing}
        milestoneTitle={milestone.title}
        mode="edit"
        busy={pending}
        initial={{
          evidenceUrl: milestone.evidenceUrl ?? null,
          evidenceNote: milestone.evidenceNote ?? null,
        }}
        onSubmit={async (value) => {
          const ok = await saveEvidence(milestone.id, value);
          if (ok) close();
        }}
        onCancel={close}
      />
    </div>
  );
}

/* ------------------------------------------------------------ reorder controls */

/**
 * Keyboard- and touch-reachable milestone reordering.
 *
 * Milestones are a narrative — "documents ingesting", then "search working", then
 * "a real user runs it" — so their order is content, not decoration. Drag is the
 * nice version and the caller is free to add it (`reorderMilestones` takes any
 * ordering); these two are the version that also works with a keyboard.
 *
 * They stack vertically at table density on a desktop and lay out side by side at
 * full touch size on a phone, because a 44px vertical stack would be taller than
 * the row it belongs to.
 */
export function MilestoneReorderControls({
  index,
  ordered,
}: {
  index: number;
  ordered: readonly { id: string }[];
}) {
  const { editable, busy, reorderMilestones } = useGoalEditing();
  if (!editable || ordered.length < 2) return null;

  const move = (to: number) => {
    const ids = ordered.map((item) => item.id);
    void reorderMilestones(moveInOrder(ids, index, to));
  };

  const base =
    'flex h-11 w-11 items-center justify-center rounded-[3px] text-ink-faint transition-colors ' +
    'hover:bg-surface-2 hover:text-ink-muted disabled:cursor-not-allowed disabled:opacity-25 ' +
    'sm:h-[18px] sm:w-[18px]';

  return (
    <span className="flex shrink-0 flex-row items-center gap-1 sm:flex-col sm:gap-[2px]">
      <button
        type="button"
        className={base}
        disabled={busy || index === 0}
        onClick={() => move(index - 1)}
        aria-label="Move milestone earlier"
      >
        <Caret up />
      </button>
      <button
        type="button"
        className={base}
        disabled={busy || index === ordered.length - 1}
        onClick={() => move(index + 1)}
        aria-label="Move milestone later"
      >
        <Caret />
      </button>
    </span>
  );
}

/* ---------------------------------------------------------------------- toast */

/**
 * The feedback line for every write on this screen.
 *
 * Ticking a task gets no confirmation dialog — it gets this, with an Undo that is
 * live for eight seconds. That is the trade the spec asks for: no friction going
 * in, a cheap way back out.
 *
 * It is a rule and a line of type on a raised surface, not a coloured banner. Only
 * a completion earns the signal colour, and it earns it as one small mark rather
 * than by tinting the whole strip; a failure is the palette's only red, because a
 * failed write is the one thing here that is genuinely wrong.
 */
export function GoalActionToast({
  toast,
  onDismiss,
}: {
  toast: GoalToast | null;
  onDismiss: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:pb-6"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            role="status"
            aria-live="polite"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.3, 1] }}
            className="pointer-events-auto flex w-full max-w-[420px] items-center gap-2 rounded-[4px] border border-rule bg-surface px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.16)] sm:w-auto"
          >
            {toast.tone === 'done' ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] bg-signal">
                <Check on="signal" />
              </span>
            ) : null}

            <span
              className={`min-w-0 flex-grow text-[13px] leading-[1.4] ${
                toast.tone === 'error' ? 'text-overdue' : 'text-ink'
              }`}
            >
              {toast.message}
            </span>

            {toast.undo ? (
              <button
                type="button"
                onClick={toast.undo}
                className="inline-flex h-11 shrink-0 items-center rounded-[3px] px-2 text-[13px] font-medium text-ink-muted underline underline-offset-4 transition-colors hover:text-ink sm:h-8"
              >
                Undo
              </button>
            ) : null}

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-[3px] text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink sm:h-8 sm:w-7"
            >
              <Close />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** The toast, wired to the provider. Render once, anywhere inside it. */
export function GoalEditingToast() {
  const { toast, dismissToast } = useGoalEditing();
  return <GoalActionToast toast={toast} onDismiss={dismissToast} />;
}

/* --------------------------------------------------------------------- glyphs */

function Plus() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden focusable="false">
      <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Check({ on }: { on?: 'signal' }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="11"
      height="11"
      fill="none"
      aria-hidden
      focusable="false"
      className="shrink-0"
    >
      <path
        d="M2.5 6.2 4.8 8.5 9.5 3.8"
        stroke={on === 'signal' ? 'var(--ink-on-signal)' : 'currentColor'}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Caret({ up }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="11"
      height="11"
      fill="none"
      aria-hidden
      focusable="false"
      className={up ? 'rotate-180' : ''}
    >
      <path
        d="M3 4.5 6 7.5 9 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Close() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden focusable="false">
      <path
        d="M3 3l6 6M9 3l-6 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
