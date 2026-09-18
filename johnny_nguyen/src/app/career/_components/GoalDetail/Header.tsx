/**
 * Goal detail — the masthead, plus this screen's data loader and composition.
 *
 * The masthead is a nameplate, not a card: title, the why-line, then a ruled strip of
 * the four facts that classify the goal. The chip row it replaces was four identical
 * pills that said four unrelated things, which is how a classification ends up
 * looking like a tag cloud. Labelled fields under a rule say the same things and say
 * what each one *is*.
 *
 * The why-line is the only real prose in the app, so it gets prose treatment — a
 * measure under 70 characters and a looser line-height than anything around it. It is
 * the sentence that decides whether you push or kill this goal, and it has to survive
 * being read six months later.
 *
 * `loadGoalDetail` and `GoalDetailScreen` live in this file rather than in a module
 * of their own because the screen was built under a file-ownership split that assigns
 * goal detail exactly three component files; a fourth would have landed on a
 * concurrent agent's work. They are the natural contents of a
 * `_components/GoalDetail/screen.tsx` — move them there once the split is over and
 * nothing else has to change.
 *
 * This module is a server component. `ProgressBlock` and `Tree` are client
 * components; the loader hands them plain rows, and every `date` column is a
 * `YYYY-MM-DD` string, never a `Date`.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { asc, eq, inArray } from 'drizzle-orm';

import {
  db,
  goals as goalsTable,
  milestones as milestonesTable,
  tasks as tasksTable,
  type Goal,
  type Milestone,
  type Task,
} from '@/lib/db';
import {
  horizonLabel,
  horizonWindow,
  monthAbbr,
  parseIsoDate,
  startOfUtcDay,
  targetDateIso,
  toIsoDate,
} from '@/lib/career/horizon';
import { goalSummary, type GoalSummary } from '@/lib/career/rollup';
import { COMPETENCY_SEED, type IsoDate } from '@/lib/career/types';

import TopBar from '../TopBar';
import ProgressBlock, {
  GoalFacts,
  WindowPanel,
  type DetailGoal,
  type DetailWindow,
} from './ProgressBlock';
import Tree from './Tree';

/* -------------------------------------------------------------------- helpers */

/** `2026-07-01` -> `1 Jul` (or `1 Jul 2026`). Null in, null out. */
function formatDay(iso: string | null | undefined, withYear = false): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  const day = `${date.getUTCDate()} ${monthAbbr(date.getUTCMonth() + 1)}`;
  return withYear ? `${day} ${date.getUTCFullYear()}` : day;
}

function sentenceCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const COMPETENCY_NAME = new Map(COMPETENCY_SEED.map((c) => [c.id as string, c.name]));

/* ----------------------------------------------------------------- nameplate */

/** One labelled fact on the masthead strip. Label above, value below, both left-aligned. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="type-condensed text-[11.5px] text-ink-faint">{label}</span>
      <span className="truncate text-[13.5px] text-ink">{children}</span>
    </div>
  );
}

/**
 * The status field. Only `done` is allowed colour — colour marks what is finished,
 * and "active" or "paused" are states, not achievements. Nothing here is red for
 * being merely unfinished.
 */
function StatusField({ goal }: { goal: DetailGoal }) {
  if (goal.status === 'done') {
    const on = formatDay(goal.closedOn);
    return (
      <Field label="Status">
        <span className="riso-register text-signal">{on ? `Done ${on}` : 'Done'}</span>
      </Field>
    );
  }
  if (goal.status === 'dropped') {
    const on = formatDay(goal.closedOn);
    return <Field label="Status">{on ? `Dropped ${on}` : 'Dropped'}</Field>;
  }
  if (goal.status === 'active') {
    const since = formatDay(goal.startedOn);
    return <Field label="Status">{since ? `Active since ${since}` : 'Active'}</Field>;
  }
  return <Field label="Status">{sentenceCase(goal.status)}</Field>;
}

/* --------------------------------------------------------------------- header */

export type HeaderProps = {
  goal: DetailGoal;
  competencyName: string;
  editable: boolean;
  /** Editing affordances (rename, change status …), injected by the mutation owner. */
  actions?: ReactNode;
  /** What sits under the nameplate, full width — in practice `<ProgressBlock />`. */
  children?: ReactNode;
};

export default function Header({
  goal,
  competencyName,
  editable,
  actions,
  children,
}: HeaderProps) {
  return (
    <section className="flex flex-col">
      <h1 className="type-display m-0 max-w-[900px] text-pretty text-[28px] leading-[1.12] text-ink sm:text-[40px]">
        {goal.title}
      </h1>

      {/* The why-line. One sentence, required on every goal — it is what tells you
          whether to push or kill this when motivation dips. The one piece of prose
          on the screen, so it gets a prose measure and a prose line-height. */}
      <p className="m-0 mt-4 max-w-[62ch] text-[16px] leading-[1.65] text-ink-muted sm:text-[17px]">
        {goal.why}
      </p>

      {goal.closeNote ? (
        <p className="m-0 mt-4 max-w-[62ch] text-[13.5px] leading-[1.6] text-ink-muted">
          <span className="text-ink-faint">
            {goal.status === 'dropped' ? 'Dropped because' : 'Closing note'}
          </span>{' '}
          {goal.closeNote}
        </p>
      ) : null}

      <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-rule-strong pt-4 sm:flex sm:flex-wrap sm:gap-x-12">
        <Field label="Horizon">{horizonLabel(goal)}</Field>
        <Field label="Kind">{sentenceCase(goal.kind)}</Field>
        <Field label="Competency">{competencyName}</Field>
        <StatusField goal={goal} />
      </div>

      {editable && actions ? <div className="mt-5">{actions}</div> : null}

      {children ? <div className="mt-10 sm:mt-12">{children}</div> : null}
    </section>
  );
}

/* ------------------------------------------------------------------- the data */

export type GoalDetailData = {
  goal: Goal;
  parent: { id: string; title: string } | null;
  milestones: Milestone[];
  /** This goal's own tasks. Children's tasks count toward the bar but not the tree. */
  tasks: Task[];
  childCount: number;
  competencyName: string;
  summary: GoalSummary;
  window: DetailWindow;
  targetDate: IsoDate | null;
  todayIso: IsoDate;
};

/**
 * One goal, everything the screen needs, in four round trips. Returns null rather
 * than throwing when the id does not exist, so the page can call `notFound()`.
 *
 * The progress bar rolls up the goal *and its children* (the spec's parent rollup),
 * which is why the child goals' tasks are fetched; the tree below shows only this
 * goal's own tasks, because a child goal's tasks belong on the child's own page.
 */
export async function loadGoalDetail(id: string): Promise<GoalDetailData | null> {
  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, id)).limit(1);
  if (!goal) return null;

  const [children, milestoneRows] = await Promise.all([
    db.select().from(goalsTable).where(eq(goalsTable.parentGoalId, goal.id)),
    db
      .select()
      .from(milestonesTable)
      .where(eq(milestonesTable.goalId, goal.id))
      .orderBy(asc(milestonesTable.sortOrder), asc(milestonesTable.createdAt)),
  ]);

  const scopeIds = [goal.id, ...children.map((child) => child.id)];
  const [taskRows, parentRows] = await Promise.all([
    db
      .select()
      .from(tasksTable)
      .where(inArray(tasksTable.goalId, scopeIds))
      .orderBy(asc(tasksTable.createdAt)),
    goal.parentGoalId
      ? db
          .select({ id: goalsTable.id, title: goalsTable.title })
          .from(goalsTable)
          .where(eq(goalsTable.id, goal.parentGoalId))
          .limit(1)
      : Promise.resolve([] as { id: string; title: string }[]),
  ]);

  const today = startOfUtcDay(new Date());
  const summary = goalSummary(goal, [goal, ...children], milestoneRows, taskRows, today);
  const window = horizonWindow(goal);

  return {
    goal,
    parent: parentRows[0] ?? null,
    milestones: milestoneRows,
    tasks: taskRows.filter((task) => task.goalId === goal.id),
    childCount: children.length,
    // The five competency ids are fixed seed data, so the name is a lookup rather
    // than a fifth query.
    competencyName: COMPETENCY_NAME.get(goal.competencyId) ?? goal.competencyId,
    summary,
    window: window ? { start: toIsoDate(window.start), end: toIsoDate(window.end) } : null,
    targetDate: targetDateIso(goal),
    todayIso: toIsoDate(today),
  };
}

/* ----------------------------------------------------------------- the screen */

export type GoalDetailScreenProps = {
  data: GoalDetailData;
  /** Public tree passes false, admin tree passes true. Same components either way. */
  editable: boolean;
  /** `/career` or `/career/admin`. Keeps every link inside the tree you are in. */
  basePath: string;
  /** Editing affordances, injected by the agent that owns mutations. */
  slots?: {
    header?: ReactNode;
    progress?: ReactNode;
    facts?: ReactNode;
    tree?: ReactNode;
    aside?: ReactNode;
    milestones?: Record<string, ReactNode>;
    tasks?: Record<string, ReactNode>;
  };
};

/**
 * Masthead, then the gauge full width, then the tree with the stored facts beside it.
 *
 * Nothing on this screen is boxed except the milestone you have open. Hierarchy is
 * carried by size and by whitespace between ruled groups — the gauge is the hero
 * because it is the largest thing and has the page's only accent in it, not because
 * it has a border the other blocks do not.
 */
export function GoalDetailScreen({ data, editable, basePath, slots }: GoalDetailScreenProps) {
  const { goal, summary, window } = data;

  return (
    <main className="min-w-0">
      <TopBar />

      <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 pb-16 pt-4 sm:px-8 sm:pb-20 sm:pt-6">
        {/* Goal detail is a drill-in, never a destination — the way back matters. */}
        <Link
          href={basePath}
          className="-ml-1 inline-flex min-h-[44px] w-fit items-center gap-2 px-1 text-[13px] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          <span aria-hidden>&larr;</span>
          Back to the dashboard
        </Link>

        <div className="mt-2">
          <Header
            goal={goal}
            competencyName={data.competencyName}
            editable={editable}
            actions={slots?.header}
          >
            <ProgressBlock
              summary={summary}
              window={window}
              todayIso={data.todayIso}
              childCount={data.childCount}
              editable={editable}
              actions={slots?.progress}
            />
          </Header>
        </div>

        <div className="mt-12 flex flex-col gap-12 sm:mt-14 lg:flex-row lg:gap-14">
          <div className="min-w-0 flex-grow">
            <Tree
              milestones={data.milestones}
              tasks={data.tasks}
              editable={editable}
              milestoneSlots={slots?.milestones}
              taskSlots={slots?.tasks}
              footer={editable ? slots?.tree : undefined}
            />
          </div>

          <aside className="flex w-full flex-col gap-10 lg:w-[272px] lg:shrink-0">
            <GoalFacts
              goal={goal}
              parent={data.parent}
              competencyName={data.competencyName}
              targetDate={data.targetDate}
              basePath={basePath}
              editable={editable}
              actions={slots?.facts}
            />
            {/* Only drawn when a horizon exists. There is no greyed-out variant of
                this block, because a goal with no horizon has no clock to read. */}
            {window ? (
              <WindowPanel summary={summary} window={window} todayIso={data.todayIso} />
            ) : null}
            {editable && slots?.aside ? slots.aside : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
