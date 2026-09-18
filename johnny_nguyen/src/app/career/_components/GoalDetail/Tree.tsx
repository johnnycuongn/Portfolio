'use client';

/**
 * Goal detail — the milestone/task tree.
 *
 * Drawn as a spine rather than a stack of cards. Each milestone hangs off one
 * continuous hairline, composed from the rows' own left borders, with its marker
 * sitting on that line: the structure is the rule, not a box. Only the milestone you
 * have open is raised onto a surface, which is the whole hierarchy on this screen —
 * the thing you are working on, and everything else quiet behind it. Nothing raised
 * is *coloured*, because an open milestone is usually unfinished and colour here
 * only ever marks what is done.
 *
 * The middle level is optional, and that is the design constraint. A goal can hold
 * tasks directly, and when it does this must not look like a tree with a level
 * missing: the spine and the markers disappear entirely and it renders as one ruled
 * list of tasks. The three shapes it handles:
 *
 *   milestones + their tasks   the normal case
 *   milestones + loose tasks   tasks with a null milestone_id get their own quiet
 *                              group at the foot of the spine, named rather than hidden
 *   tasks only                 a plain ruled list, no spine, no chevrons
 *
 * Evidence lives on milestones, never on tasks — that asymmetry is deliberate in
 * the spec and is what keeps the achievement log full of checkpoints rather than
 * chores, so a task row is a checkbox, a title and an effort size, nothing more.
 *
 * Indentation is deliberately shallow (20px per level, two levels deep at most) so a
 * task title still has most of a 390px screen to itself.
 *
 * Presentational. Every control here is inert; the live ones arrive through
 * `milestoneSlots` / `milestoneAddSlots` / `taskSlots`, keyed by row id, and
 * `footer` under the whole tree. `GoalDetailScreen` fills those from `AddForms`
 * when the screen is editable, and passes nothing at all when it is not.
 */

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { milestoneProgress, percent, progressOf } from '@/lib/career/rollup';
import type { IsoDate } from '@/lib/career/types';
import { formatDetailDay } from './ProgressBlock';

/* --------------------------------------------------------------------- shapes */

/** A `Milestone` row satisfies this. */
export type TreeMilestone = {
  id: string;
  goalId: string;
  title: string;
  status: string;
  targetDate: IsoDate | null;
  completedAt: IsoDate | null;
  evidenceUrl: string | null;
  evidenceNote: string | null;
};

/** A `Task` row satisfies this. */
export type TreeTask = {
  id: string;
  goalId: string;
  milestoneId: string | null;
  title: string;
  status: string;
  effort: string;
};

export type TreeProps = {
  milestones: readonly TreeMilestone[];
  /** This goal's tasks only. A child goal's tasks belong on the child's own page. */
  tasks: readonly TreeTask[];
  editable: boolean;
  /** Per-row editing controls, keyed by milestone id. Rendered at the end of the row. */
  milestoneSlots?: Record<string, ReactNode>;
  /**
   * Keyed by milestone id, and rendered directly under that milestone's task list,
   * inside the same indent — in practice an "add a task" affordance. Separate from
   * `milestoneSlots` only because the thing that *extends* a list belongs at the
   * foot of the list, and the thing that *closes out* the milestone belongs below
   * the evidence it is about to be filed with.
   */
  milestoneAddSlots?: Record<string, ReactNode>;
  /** Per-row editing controls, keyed by task id. */
  taskSlots?: Record<string, ReactNode>;
  /** Anything that belongs under the whole tree — an "add milestone" control, say. */
  footer?: ReactNode;
};

/* ---------------------------------------------------------------- task segments */

/**
 * A milestone's tasks as one tick each, filled for done. The same idiom the timeline
 * uses to subdivide a bar, and deliberately *not* a second progress bar: a repeat of
 * the gauge above would flatten the page back out. Past sixteen tasks the ticks stop
 * being countable, so it degrades to a plain fill.
 */
function Segments({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;

  if (total > 16) {
    return (
      <span aria-hidden className="hidden h-2 w-[88px] shrink-0 rounded-[1px] bg-track sm:block">
        <span
          className="block h-full rounded-[1px] bg-signal"
          style={{ width: `${percent(done / total)}%` }}
        />
      </span>
    );
  }

  return (
    <span aria-hidden className="hidden w-[88px] shrink-0 gap-[2px] sm:flex">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2 flex-1 rounded-[1px] ${i < done ? 'bg-signal' : 'bg-track'}`}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ task row */

function TaskRow({ task, slot }: { task: TreeTask; slot?: ReactNode }) {
  const done = task.status === 'done';
  const doing = task.status === 'doing';

  return (
    <div className="flex min-h-[44px] items-center gap-3 border-b border-rule py-2 last:border-b-0">
      <span
        aria-hidden
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border ${
          done ? 'border-signal bg-signal' : 'border-rule-strong bg-surface'
        }`}
      >
        {done ? (
          <svg viewBox="0 0 12 12" className="h-[11px] w-[11px]" fill="none" aria-hidden>
            <path
              d="M2.5 6.2 4.8 8.5 9.5 3.8"
              stroke="var(--ink-on-signal)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>

      {/* `break-words`: two levels of indentation plus a checkbox leaves a task
          title about 300px at 390, and one long unbroken token in it would push
          the whole page sideways rather than wrap. */}
      <span
        className={`min-w-0 break-words text-[13.5px] leading-[1.4] ${
          done ? 'text-ink-faint line-through' : 'text-ink'
        }`}
      >
        {task.title}
      </span>

      {doing ? (
        <span className="shrink-0 rounded-[2px] bg-surface-2 px-1.5 py-px text-[11px] text-ink-muted">
          Doing
        </span>
      ) : null}

      <span className="flex-grow" />
      {slot}
      <span className="type-condensed shrink-0 text-[11.5px] text-ink-faint">{task.effort}</span>
    </div>
  );
}

function TaskList({
  tasks,
  taskSlots,
  empty,
}: {
  tasks: readonly TreeTask[];
  taskSlots?: Record<string, ReactNode>;
  empty: string;
}) {
  if (tasks.length === 0) {
    return <p className="m-0 py-3 text-[12.5px] text-ink-muted">{empty}</p>;
  }
  return (
    <div className="flex flex-col">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} slot={taskSlots?.[task.id]} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- evidence */

function Evidence({ milestone }: { milestone: TreeMilestone }) {
  const { evidenceUrl, evidenceNote } = milestone;
  if (!evidenceUrl && !evidenceNote) return null;

  return (
    <div className="mt-3 rounded-[3px] border border-rule bg-surface-2 px-3.5 py-3">
      <p className="type-condensed m-0 mb-1.5 text-[11px] text-ink-faint">Evidence</p>
      <div className="flex min-w-0 flex-col gap-1.5">
        {evidenceUrl ? (
          <a
            href={evidenceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="truncate text-[13px] text-signal underline-offset-4 hover:underline"
          >
            {evidenceUrl.replace(/^https?:\/\//, '')}
          </a>
        ) : null}
        {evidenceNote ? (
          <span className="text-[12.5px] leading-[1.5] text-ink-muted">{evidenceNote}</span>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- spine marker */

/**
 * The mark on the spine. Filled means reached; everything unfinished is an outline,
 * whether it is started or not, because a colour on an unfinished milestone is a
 * promise the record has not earned yet.
 */
function Marker({ reached, started }: { reached: boolean; started: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute -left-[25px] top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-[1px] border sm:-left-[29px] ${
        reached
          ? 'border-signal bg-signal'
          : started
            ? 'border-ink-faint bg-ground'
            : 'border-rule-strong bg-ground'
      }`}
    />
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 text-ink-faint transition-transform duration-200 ${
        open ? 'rotate-90' : ''
      }`}
      fill="none"
    >
      <path
        d="M4.5 2.5 8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------ milestone entry */

function MilestoneEntry({
  milestone,
  tasks,
  open,
  onToggle,
  editable,
  slot,
  addSlot,
  taskSlots,
}: {
  milestone: TreeMilestone;
  tasks: readonly TreeTask[];
  open: boolean;
  onToggle: () => void;
  editable: boolean;
  slot?: ReactNode;
  addSlot?: ReactNode;
  taskSlots?: Record<string, ReactNode>;
}) {
  // motion/react writes inline transforms, which the global reduced-motion rule
  // in theme.css cannot cancel — the guard has to be in the component.
  const reduceMotion = useReducedMotion();
  const mine = tasks.filter((t) => t.milestoneId === milestone.id);
  const progress = milestoneProgress(milestone.id, tasks);
  const reached = milestone.status === 'done';
  // Marking a milestone done completes its remaining tasks, so status wins over the
  // task count when the two ever disagree.
  const doneCount = reached ? progress.totalCount : progress.doneCount;
  const started = progress.doneCount > 0 || milestone.status === 'doing';
  const hasEvidence = Boolean(milestone.evidenceUrl || milestone.evidenceNote);
  const date = formatDetailDay(reached ? milestone.completedAt : milestone.targetDate);
  const count =
    progress.totalCount > 0 ? `${doneCount} of ${progress.totalCount}` : 'No tasks yet';

  return (
    <li className="border-l border-rule pl-5 sm:pl-6">
      <div className={open ? 'rounded-r-[3px] bg-surface shadow-panel' : ''}>
        {/* The marker hangs off the header row, not off the whole entry, so it stays
            level with the title when the title wraps to two lines on a phone. */}
        <h3 className="relative m-0">
          <Marker reached={reached} started={started} />
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex w-full min-h-[52px] items-center gap-3 border-b border-rule bg-transparent px-3 py-2.5 text-left"
          >
            <Chevron open={open} />

            <span className="flex min-w-0 flex-grow flex-col gap-0.5">
              <span
                className={`break-words text-[14.5px] sm:truncate ${
                  reached ? 'font-normal text-ink-muted' : 'font-medium text-ink'
                }`}
              >
                {milestone.title}
              </span>
              <span className="type-condensed flex gap-3 text-[11.5px] text-ink-faint sm:hidden">
                <span>{count}</span>
                {date ? <span>{date}</span> : null}
              </span>
            </span>

            <span className="type-condensed hidden shrink-0 text-[11.5px] text-ink-muted sm:inline">
              {count}
            </span>
            <Segments done={doneCount} total={progress.totalCount} />
            <span className="type-condensed hidden w-[62px] shrink-0 text-right text-[11.5px] text-ink-faint sm:inline">
              {date ?? ''}
            </span>
          </button>
        </h3>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="body"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="border-b border-rule px-3 pb-4 pt-1">
                <div className="border-l border-rule pl-3 sm:pl-4">
                  <TaskList
                    tasks={mine}
                    taskSlots={taskSlots}
                    empty="No tasks under this one yet."
                  />
                  {addSlot ? <div className="mt-1">{addSlot}</div> : null}
                </div>
                <Evidence milestone={milestone} />
                {!hasEvidence && !reached && editable ? (
                  <p className="m-0 mt-3 rounded-[3px] border border-dashed border-rule-strong px-3.5 py-3 text-[12px] leading-[1.5] text-ink-muted">
                    This one cannot be marked reached while both evidence fields are empty.
                  </p>
                ) : null}
                {slot ? <div className="mt-3">{slot}</div> : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------- the tree */

function firstOpenId(milestones: readonly TreeMilestone[]): string | null {
  const next = milestones.find((m) => m.status !== 'done');
  return next?.id ?? null;
}

export default function Tree({
  milestones,
  tasks,
  editable,
  milestoneSlots,
  milestoneAddSlots,
  taskSlots,
  footer,
}: TreeProps) {
  // Opens on the milestone you are actually working on, which is the one thing you
  // came to this screen to look at. Everything else stays folded.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const id = firstOpenId(milestones);
    return id ? { [id]: true } : {};
  });

  const toggle = (id: string) => setOpen((current) => ({ ...current, [id]: !current[id] }));

  const loose = tasks.filter((t) => t.milestoneId === null);
  const hasMilestones = milestones.length > 0;
  const looseProgress = progressOf(loose);

  return (
    <section className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule-strong pb-2.5">
        <h2 className="type-display m-0 text-[19px] text-ink">
          {hasMilestones ? 'Milestones' : 'Tasks'}
        </h2>
        <p className="m-0 text-[12.5px] text-ink-muted">
          {hasMilestones
            ? 'Each one carries the evidence. Tasks underneath do not.'
            : 'Small enough not to need milestones. Tasks sit on the goal directly.'}
        </p>
      </div>

      {hasMilestones ? (
        <ul className="m-0 mt-1 flex list-none flex-col p-0">
          {milestones.map((milestone) => (
            <MilestoneEntry
              key={milestone.id}
              milestone={milestone}
              tasks={tasks}
              open={Boolean(open[milestone.id])}
              onToggle={() => toggle(milestone.id)}
              editable={editable}
              slot={milestoneSlots?.[milestone.id]}
              addSlot={milestoneAddSlots?.[milestone.id]}
              taskSlots={taskSlots}
            />
          ))}

          {/* Tasks with a null milestone_id: named at the foot of the spine rather
              than hidden, but without a marker — there is no checkpoint to reach. */}
          {loose.length > 0 ? (
            <li className="relative border-l border-rule pl-5 sm:pl-6">
              <div className="flex min-h-[40px] items-center gap-3 border-b border-rule px-3">
                <span className="text-[13px] text-ink-muted">Not under a milestone</span>
                <span className="flex-grow" />
                <span className="type-condensed text-[11.5px] text-ink-faint">
                  {looseProgress.doneCount} of {looseProgress.totalCount}
                </span>
              </div>
              <div className="border-b border-rule px-3 pb-4 pt-1">
                <div className="border-l border-rule pl-3 sm:pl-4">
                  <TaskList
                    tasks={loose}
                    taskSlots={taskSlots}
                    empty="Nothing sitting outside a milestone."
                  />
                </div>
              </div>
            </li>
          ) : null}
        </ul>
      ) : (
        /* No middle level. No spine, no markers, no empty milestone shell — just the
           tasks, so a two-week goal does not read as a tree with a rung missing. */
        <div className="mt-1">
          <TaskList
            tasks={loose}
            taskSlots={taskSlots}
            empty="Nothing broken down yet. Tasks are the atoms the progress bar counts."
          />
        </div>
      )}

      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}
