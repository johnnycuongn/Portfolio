/**
 * Master table — the pure half.
 *
 * Everything here is a plain function over plain data: no React, no database, no
 * clock of its own. `today` is always an argument, which is what lets the server
 * decide the day once and the client render the same thing (a `new Date()` inside
 * a row would be a hydration mismatch waiting for midnight).
 *
 * The shape of the screen, per the spec: ONE table. Goal, milestone and task rows
 * share it, distinguished by an indent and a type chip, with the goal and its
 * horizon denormalised into columns so reading a row never needs a join. Wins
 * ride along under a synthetic "Unplanned" goal — they are achievements that were
 * never planned, and hiding them from the one table that holds everything would
 * make the table a lie.
 */

import {
  COMPETENCY_IDS,
  EFFORTS,
  GOAL_KINDS,
  GOAL_STATUSES,
  HORIZON_TYPES,
  ITEM_STATUSES,
  type CompetencyId,
  type Effort,
  type GoalKind,
  type GoalStatus,
  type HorizonType,
  type IsoDate,
  type ItemStatus,
} from '@/lib/career/types';
import {
  currentHorizonValue,
  daysBetween,
  horizonLabel,
  monthAbbr,
  parseIsoDate,
  startOfUtcDay,
} from '@/lib/career/horizon';

/* ------------------------------------------------------------------ the input */

/*
 * Deliberately structural and minimal — the narrowest shape each row type needs.
 * The drizzle row types (`Goal`, `Milestone`, `Task`, `Win`, `Competency`) all
 * satisfy these, so `_queries` can hand over rows straight from the database
 * without a mapping layer, and this module still has no drizzle import.
 *
 * Every `date` column is a `YYYY-MM-DD` string, not a `Date`.
 */

export type TableGoal = {
  id: string;
  title: string;
  horizonType: HorizonType | string;
  horizonValue: string | null;
  customStart: IsoDate | null;
  customEnd: IsoDate | null;
  kind: GoalKind | string;
  status: GoalStatus | string;
  competencyId: string;
};

export type TableMilestone = {
  id: string;
  goalId: string;
  title: string;
  sortOrder: number;
  status: ItemStatus | string;
  competencyId: string;
  evidenceUrl: string | null;
  evidenceNote: string | null;
  targetDate: IsoDate | null;
  completedAt: IsoDate | null;
};

export type TableTask = {
  id: string;
  goalId: string;
  milestoneId: string | null;
  title: string;
  status: ItemStatus | string;
  effort: Effort | string;
  startedOn: IsoDate | null;
  completedAt: IsoDate | null;
};

export type TableWin = {
  id: string;
  title: string;
  happenedOn: IsoDate;
  competencyId: string;
  impactNote: string;
  evidenceUrl: string | null;
};

export type TableCompetency = { id: string; name: string; sortOrder: number };

/** The whole table's input. `_queries` returns this; the pages pass it straight through. */
export type MasterTableData = {
  goals: readonly TableGoal[];
  milestones: readonly TableMilestone[];
  tasks: readonly TableTask[];
  wins: readonly TableWin[];
  competencies: readonly TableCompetency[];
};

export const EMPTY_MASTER_TABLE_DATA: MasterTableData = {
  goals: [],
  milestones: [],
  tasks: [],
  wins: [],
  competencies: [],
};

/* -------------------------------------------------------------------- the row */

/**
 * A goal is a row here, not only a column.
 *
 * The spec's first principle is "one master table, many views — every unit of work
 * is a row in one place", and a goal is a unit of work. Leaving it out meant a
 * ledger holding two goals and no milestones showed an empty master table while
 * the dashboard showed both, which reads as a bug however it is explained.
 */
export type RowType = 'goal' | 'milestone' | 'task' | 'win';

/**
 * One rendered line. Fully denormalised on purpose — the goal title, its horizon
 * and the competency name are carried on the row so both filtering and rendering
 * are a field read, never a lookup through three maps.
 */
export type TableRow = {
  /** Unique across the whole table: `milestone:<id>`. Safe as a React key. */
  key: string;
  /** The underlying record's id — what a mutation route needs. */
  id: string;
  type: RowType;
  /** Goal → milestone → task, the spec's three levels. One indent step each. */
  level: 0 | 1 | 2;

  goalId: string | null;
  goalTitle: string;
  goalKind: GoalKind | string | null;
  goalStatus: GoalStatus | string | null;

  horizonType: HorizonType | string;
  horizonValue: string | null;
  /** Rendered horizon cell: `Q3 2026`, `Sep 2026`, `6 Jul–30 Oct`, `—`. */
  horizon: string;

  title: string;
  /** Goals carry their own status set; milestones, tasks and wins carry the other. */
  status: ItemStatus | GoalStatus;
  competencyId: string;
  competencyName: string;
  effort: Effort | null;

  targetDate: IsoDate | null;
  completedAt: IsoDate | null;
  evidenceUrl: string | null;
  evidenceNote: string | null;

  /** Task only. Drives the "sat in Doing too long" marker. */
  startedOn: IsoDate | null;
  /** Task only — its parent milestone, when it has one. */
  milestoneId: string | null;
  /** Build order, so a sort can always fall back to the natural reading order. */
  index: number;
};

/* ------------------------------------------------------------------- labelling */

export const STATUS_LABEL: Record<ItemStatus | GoalStatus, string> = {
  todo: 'Todo',
  doing: 'Doing',
  done: 'Done',
  // Goal statuses. `done` is shared and means the same thing on both.
  active: 'Active',
  paused: 'Paused',
  backlog: 'Backlog',
  dropped: 'Dropped',
};

export const ROW_TYPE_LABEL: Record<RowType, string> = {
  goal: 'Goal',
  milestone: 'Milestone',
  task: 'Task',
  win: 'Win',
};

export const HORIZON_TYPE_LABEL: Record<HorizonType, string> = {
  none: 'No horizon',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Custom',
};

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  skill: 'Skill',
  certification: 'Certification',
  domain: 'Domain',
  role: 'Role',
  project: 'Project',
};

/** The synthetic goal wins sit under. Wins never belong to a goal, by definition. */
export const UNPLANNED_GOAL_LABEL = 'Unplanned';

/** Placeholder for an empty cell. One character, muted, never the word "none". */
export const EMPTY_CELL = '—';

/** `2026-09-25` -> `25 Sep`. Null or malformed degrades to the empty cell. */
export function formatDayMonth(iso: IsoDate | null | undefined): string {
  const date = parseIsoDate(iso ?? null);
  if (!date) return EMPTY_CELL;
  return `${date.getUTCDate()} ${monthAbbr(date.getUTCMonth() + 1)}`;
}

/**
 * A custom horizon reads better as its actual window than as "to 30 Oct" — this is
 * the one column where both ends fit. Everything else defers to `horizonLabel`,
 * so the badge on the dashboard and the cell here can never disagree.
 */
export function horizonCell(goal: {
  horizonType: HorizonType | string;
  horizonValue: string | null;
  customStart: IsoDate | null;
  customEnd: IsoDate | null;
}): string {
  if (goal.horizonType === 'none') return EMPTY_CELL;
  if (goal.horizonType === 'custom') {
    const start = parseIsoDate(goal.customStart);
    const end = parseIsoDate(goal.customEnd);
    if (start && end) return `${formatDayMonth(goal.customStart)}–${formatDayMonth(goal.customEnd)}`;
  }
  return horizonLabel(goal);
}

/** `https://github.com/x/y/pull/412` -> `github.com/x/y/…`. Never throws on junk. */
export function prettyUrl(url: string, max = 28): string {
  let text = url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
  if (text.length > max) text = `${text.slice(0, max - 1)}…`;
  return text;
}

/** What the Evidence cell says: the note if there is one, else a tidied URL. */
export function evidenceLabel(row: Pick<TableRow, 'evidenceUrl' | 'evidenceNote'>): string | null {
  const note = row.evidenceNote?.trim();
  if (note) return note.length > 28 ? `${note.slice(0, 27)}…` : note;
  if (row.evidenceUrl?.trim()) return prettyUrl(row.evidenceUrl);
  return null;
}

/* ------------------------------------------------------------- stale in Doing */

/**
 * The spec's one exception to "rows are colour-coded only by status": a task that
 * has been in Doing for more than 21 days gets a subtle marker. Things that sit in
 * Doing forever are the honest signal that a goal has stalled, and this screen is
 * where they get caught. It is a marker, not an alarm — no red, no count anywhere
 * else in the app.
 */
export const STALE_DOING_DAYS = 21;

/** Days a task has been in Doing, or null when that is not a question about this row. */
export function doingDays(row: TableRow, today: IsoDate): number | null {
  if (row.type !== 'task' || row.status !== 'doing') return null;
  const started = parseIsoDate(row.startedOn);
  const day = parseIsoDate(today);
  if (!started || !day) return null;
  const days = daysBetween(started, startOfUtcDay(day));
  return days >= 0 ? days : null;
}

export function isStale(row: TableRow, today: IsoDate): boolean {
  const days = doingDays(row, today);
  return days !== null && days > STALE_DOING_DAYS;
}

/**
 * The only thing on this screen allowed to be red, and only because it is literally
 * true: a target date that has been and gone on a row that is not finished. A row
 * with no target date is never overdue — a goal with no horizon has no pace, and
 * inventing one would be the exact dishonesty the spec forbids.
 *
 * Both sides are `YYYY-MM-DD`, which sorts lexicographically, so this needs no Date.
 */
export function isOverdue(row: TableRow, today: IsoDate): boolean {
  if (row.status === 'done' || !row.targetDate) return false;
  return row.targetDate < today;
}

/* ---------------------------------------------------------------- building rows */

const GOAL_STATUS_RANK: Record<string, number> = {
  active: 0,
  doing: 0,
  paused: 1,
  backlog: 2,
  done: 3,
  dropped: 4,
};

/**
 * Grouping by status has to order both status sets in one list. Open work first,
 * finished after it, abandoned last — the same left-to-right reading the rest of
 * the app uses.
 */
const STATUS_RANK: Record<ItemStatus | GoalStatus, number> = {
  backlog: 0,
  todo: 1,
  active: 2,
  doing: 3,
  paused: 4,
  done: 5,
  dropped: 6,
};

const HORIZON_TYPE_RANK: Record<string, number> = {
  yearly: 0,
  quarterly: 1,
  monthly: 2,
  custom: 3,
  none: 4,
};

function asItemStatus(value: string): ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value) ? (value as ItemStatus) : 'todo';
}

function asEffort(value: string | null | undefined): Effort | null {
  return value && (EFFORTS as readonly string[]).includes(value) ? (value as Effort) : null;
}

/**
 * Flattens the three tables into one reading order: goal by goal, and within a
 * goal each milestone followed by its own tasks, then the tasks the goal holds
 * directly. Wins come last, under the synthetic Unplanned goal.
 *
 * Goals are ordered by status (what you are working on first, what you dropped
 * last) and then by title, so the order is stable across renders and does not
 * depend on how the database felt like returning them.
 */
export function buildTableRows(data: MasterTableData): TableRow[] {
  const competencyName = new Map(data.competencies.map((c) => [c.id, c.name]));
  const nameOf = (id: string) => competencyName.get(id) ?? id;

  const milestonesByGoal = new Map<string, TableMilestone[]>();
  for (const milestone of data.milestones) {
    const list = milestonesByGoal.get(milestone.goalId);
    if (list) list.push(milestone);
    else milestonesByGoal.set(milestone.goalId, [milestone]);
  }

  const tasksByGoal = new Map<string, TableTask[]>();
  for (const task of data.tasks) {
    const list = tasksByGoal.get(task.goalId);
    if (list) list.push(task);
    else tasksByGoal.set(task.goalId, [task]);
  }

  const goals = [...data.goals].sort((a, b) => {
    const rank = (GOAL_STATUS_RANK[a.status] ?? 9) - (GOAL_STATUS_RANK[b.status] ?? 9);
    return rank !== 0 ? rank : a.title.localeCompare(b.title);
  });

  const rows: TableRow[] = [];
  let index = 0;

  const pushTask = (task: TableTask, goal: TableGoal, horizon: string) => {
    rows.push({
      key: `task:${task.id}`,
      id: task.id,
      type: 'task',
      level: 2,
      goalId: goal.id,
      goalTitle: goal.title,
      goalKind: goal.kind,
      goalStatus: goal.status,
      horizonType: goal.horizonType,
      horizonValue: goal.horizonValue,
      horizon,
      title: task.title,
      status: asItemStatus(String(task.status)),
      // A task carries no competency of its own — it inherits the goal's, which is
      // what makes "group by competency" cover every row rather than most of them.
      competencyId: goal.competencyId,
      competencyName: nameOf(goal.competencyId),
      effort: asEffort(String(task.effort)),
      targetDate: null,
      completedAt: task.completedAt,
      evidenceUrl: null,
      evidenceNote: null,
      startedOn: task.startedOn,
      milestoneId: task.milestoneId,
      index: index++,
    });
  };

  for (const goal of goals) {
    const horizon = horizonCell(goal);

    rows.push({
      key: `goal:${goal.id}`,
      id: goal.id,
      type: 'goal',
      level: 0,
      goalId: goal.id,
      goalTitle: goal.title,
      goalKind: goal.kind,
      goalStatus: goal.status,
      horizonType: goal.horizonType,
      horizonValue: goal.horizonValue,
      horizon,
      title: goal.title,
      status: goal.status as GoalStatus,
      competencyId: goal.competencyId,
      competencyName: nameOf(goal.competencyId),
      effort: null,
      // Derived from the horizon rather than stored, so it stays in step with it.
      targetDate: null,
      completedAt: null,
      evidenceUrl: null,
      evidenceNote: null,
      startedOn: null,
      milestoneId: null,
      index: index++,
    });
    const goalMilestones = [...(milestonesByGoal.get(goal.id) ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
    );
    const goalTasks = tasksByGoal.get(goal.id) ?? [];

    for (const milestone of goalMilestones) {
      rows.push({
        key: `milestone:${milestone.id}`,
        id: milestone.id,
        type: 'milestone',
        level: 0,
        goalId: goal.id,
        goalTitle: goal.title,
        goalKind: goal.kind,
        goalStatus: goal.status,
        horizonType: goal.horizonType,
        horizonValue: goal.horizonValue,
        horizon,
        title: milestone.title,
        status: asItemStatus(String(milestone.status)),
        competencyId: milestone.competencyId,
        competencyName: nameOf(milestone.competencyId),
        effort: null,
        targetDate: milestone.targetDate,
        completedAt: milestone.completedAt,
        evidenceUrl: milestone.evidenceUrl,
        evidenceNote: milestone.evidenceNote,
        startedOn: null,
        milestoneId: milestone.id,
        index: index++,
      });

      for (const task of goalTasks.filter((t) => t.milestoneId === milestone.id)) {
        pushTask(task, goal, horizon);
      }
    }

    // Tasks the goal holds directly. The middle level is optional, so these are not
    // an edge case — a two-week goal is expected to have no milestones at all.
    for (const task of goalTasks.filter((t) => !t.milestoneId)) {
      pushTask(task, goal, horizon);
    }
  }

  const wins = [...data.wins].sort((a, b) => b.happenedOn.localeCompare(a.happenedOn));
  for (const win of wins) {
    rows.push({
      key: `win:${win.id}`,
      id: win.id,
      type: 'win',
      level: 0,
      goalId: null,
      goalTitle: UNPLANNED_GOAL_LABEL,
      goalKind: null,
      goalStatus: null,
      horizonType: 'none',
      horizonValue: null,
      horizon: EMPTY_CELL,
      title: win.title,
      // A win is a thing that already happened. It has no other state.
      status: 'done',
      competencyId: win.competencyId,
      competencyName: nameOf(win.competencyId),
      effort: null,
      targetDate: null,
      completedAt: win.happenedOn,
      evidenceUrl: win.evidenceUrl,
      evidenceNote: win.impactNote?.trim() ? win.impactNote : null,
      startedOn: null,
      milestoneId: null,
      index: index++,
    });
  }

  return rows;
}

/* ------------------------------------------------------------------- filtering */

export const GROUP_BYS = ['goal', 'competency', 'horizon', 'status'] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

export const GROUP_BY_LABEL: Record<GroupBy, string> = {
  goal: 'Goal',
  competency: 'Competency',
  horizon: 'Horizon',
  status: 'Status',
};

export type SortBy = 'natural' | 'completed-desc';

export type FilterState = {
  search: string;
  /** Both sets, because goals and their children do not share a status vocabulary. */
  statuses: readonly (ItemStatus | GoalStatus)[];
  horizonTypes: readonly HorizonType[];
  competencyIds: readonly string[];
  kinds: readonly GoalKind[];
  /** Pins the horizon to one exact period — what "This quarter" means. */
  horizonValue: string | null;
  groupBy: GroupBy;
  sortBy: SortBy;
};

export const EMPTY_FILTERS: FilterState = {
  search: '',
  statuses: [],
  horizonTypes: [],
  competencyIds: [],
  kinds: [],
  horizonValue: null,
  groupBy: 'goal',
  sortBy: 'natural',
};

/** Whether anything is narrowing the view — drives the "Clear" affordance. */
export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.statuses.length > 0 ||
    filters.horizonTypes.length > 0 ||
    filters.competencyIds.length > 0 ||
    filters.kinds.length > 0 ||
    filters.horizonValue !== null
  );
}

/** Case-insensitive substring across everything a row shows in words. */
export function matchesSearch(row: TableRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.title.toLowerCase().includes(q) ||
    row.goalTitle.toLowerCase().includes(q) ||
    row.competencyName.toLowerCase().includes(q) ||
    (row.evidenceNote?.toLowerCase().includes(q) ?? false) ||
    (row.evidenceUrl?.toLowerCase().includes(q) ?? false)
  );
}

export function applyFilters(rows: readonly TableRow[], filters: FilterState): TableRow[] {
  const statuses = new Set<string>(filters.statuses);
  const horizonTypes = new Set<string>(filters.horizonTypes);
  const competencyIds = new Set<string>(filters.competencyIds);
  const kinds = new Set<string>(filters.kinds);

  const kept = rows.filter((row) => {
    if (statuses.size && !statuses.has(row.status)) return false;
    if (horizonTypes.size && !horizonTypes.has(String(row.horizonType))) return false;
    if (competencyIds.size && !competencyIds.has(row.competencyId)) return false;
    // A win has no goal and therefore no kind — filtering by kind excludes it, which
    // is the honest answer rather than silently letting it through.
    if (kinds.size && (row.goalKind === null || !kinds.has(String(row.goalKind)))) return false;
    if (filters.horizonValue !== null && row.horizonValue !== filters.horizonValue) return false;
    return matchesSearch(row, filters.search);
  });

  if (filters.sortBy === 'completed-desc') {
    return kept.sort((a, b) => {
      // Nulls last: an unfinished row has no place in a newest-first list of finishes.
      if (a.completedAt === b.completedAt) return a.index - b.index;
      if (!a.completedAt) return 1;
      if (!b.completedAt) return -1;
      return b.completedAt.localeCompare(a.completedAt);
    });
  }
  return kept;
}

/* -------------------------------------------------------------------- grouping */

export type RowGroup = {
  key: string;
  label: string;
  rows: TableRow[];
};

function groupKeyOf(row: TableRow, groupBy: GroupBy): { key: string; label: string; rank: number } {
  switch (groupBy) {
    case 'competency':
      return {
        key: row.competencyId,
        label: row.competencyName,
        rank: (COMPETENCY_IDS as readonly string[]).indexOf(row.competencyId),
      };
    case 'horizon':
      return {
        key: `${row.horizonType}:${row.horizonValue ?? ''}`,
        label: row.horizon === EMPTY_CELL ? HORIZON_TYPE_LABEL.none : row.horizon,
        rank: HORIZON_TYPE_RANK[String(row.horizonType)] ?? 9,
      };
    case 'status':
      return {
        key: row.status,
        label: STATUS_LABEL[row.status],
        rank: STATUS_RANK[row.status] ?? 9,
      };
    case 'goal':
    default:
      return { key: row.goalId ?? '__unplanned', label: row.goalTitle, rank: row.index };
  }
}

/**
 * Buckets the rows under sticky headers. Group order is meaningful, not
 * alphabetical: competencies keep their fixed spine order, horizons run longest
 * window first, statuses run todo → doing → done, and goals keep the reading
 * order `buildTableRows` already established.
 */
export function groupRows(rows: readonly TableRow[], groupBy: GroupBy): RowGroup[] {
  const buckets = new Map<string, { label: string; rank: number; rows: TableRow[] }>();

  for (const row of rows) {
    const { key, label, rank } = groupKeyOf(row, groupBy);
    const bucket = buckets.get(key);
    if (bucket) bucket.rows.push(row);
    else buckets.set(key, { label, rank: rank < 0 ? 9_999 : rank, rows: [row] });
  }

  return [...buckets.entries()]
    .sort((a, b) => a[1].rank - b[1].rank || a[1].label.localeCompare(b[1].label))
    .map(([key, bucket]) => ({ key, label: bucket.label, rows: bucket.rows }));
}

/* --------------------------------------------------------------------- columns */

export type ColumnId =
  | 'goal'
  | 'horizon'
  | 'item'
  | 'status'
  | 'competency'
  | 'effort'
  | 'target'
  | 'completed'
  | 'evidence';

export type TableColumn = {
  id: ColumnId;
  /** Sentence case. These are column names, not shouted labels. */
  label: string;
  /** Fixed width in px. Exactly one column omits it and absorbs the slack. */
  width?: number;
  align: 'left' | 'center' | 'right';
  /**
   * The grouping whose header row already states this column's value, making the
   * column pure repetition. Grouping by goal — the default — and then reprinting
   * the goal title on all forty of its rows costs 214px on the one screen where
   * horizontal space is the entire problem.
   *
   * Only ever set on a column with no inline editor. Status and competency stay
   * put whatever the grouping, because you group by status precisely in order to
   * move things along, and a column you cannot see is a column you cannot edit.
   */
  redundantWhen?: GroupBy;
};

/** Floor for the one flexible column, so the grid stays readable when narrow. */
export const FLEX_COLUMN_MIN = 300;

/** Left and right gutters of the grid, counted into its minimum width. */
const GRID_GUTTER = 36;

export const TABLE_COLUMNS: readonly TableColumn[] = [
  { id: 'goal', label: 'Goal', width: 214, align: 'left', redundantWhen: 'goal' },
  { id: 'horizon', label: 'Horizon', width: 106, align: 'left', redundantWhen: 'horizon' },
  { id: 'item', label: 'Goal, milestone or task', align: 'left' },
  { id: 'status', label: 'Status', width: 100, align: 'left' },
  { id: 'competency', label: 'Competency', width: 152, align: 'left' },
  { id: 'effort', label: 'Effort', width: 66, align: 'center' },
  { id: 'target', label: 'Target', width: 86, align: 'right' },
  { id: 'completed', label: 'Completed', width: 98, align: 'right' },
  { id: 'evidence', label: 'Evidence', width: 142, align: 'right' },
];

export function visibleColumns(groupBy: GroupBy): TableColumn[] {
  return TABLE_COLUMNS.filter((column) => column.redundantWhen !== groupBy);
}

/** Narrowest the grid can be drawn before the columns start lying about their size. */
export function tableMinWidth(columns: readonly TableColumn[]): number {
  return columns.reduce((sum, column) => sum + (column.width ?? FLEX_COLUMN_MIN), GRID_GUTTER);
}

/* --------------------------------------------------------------------- presets */

export const PRESET_IDS = ['open', 'quarter', 'completed', 'competency'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export type Preset = {
  id: PresetId;
  label: string;
  /** Built fresh from `today` because "this quarter" is not a constant. */
  filters: (today: IsoDate) => FilterState;
};

/**
 * Four buttons that cover almost every real use of this screen, so the filter
 * chips stay a thing you rarely touch. The spec is explicit that a saved-views
 * feature does not get built until these have been wanted round three times.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'open',
    label: 'Everything open',
    filters: () => ({
      ...EMPTY_FILTERS,
      statuses: ['todo', 'doing', 'active', 'paused', 'backlog'],
    }),
  },
  {
    id: 'quarter',
    label: 'This quarter',
    filters: (today) => ({
      ...EMPTY_FILTERS,
      horizonTypes: ['quarterly'],
      horizonValue: currentHorizonValue('quarterly', parseIsoDate(today) ?? new Date(today)),
    }),
  },
  {
    id: 'completed',
    label: 'Completed',
    filters: () => ({ ...EMPTY_FILTERS, statuses: ['done'], sortBy: 'completed-desc' }),
  },
  {
    id: 'competency',
    label: 'By competency',
    // The promotion-prep view: every row grouped under the competency it argues for.
    filters: () => ({ ...EMPTY_FILTERS, groupBy: 'competency' }),
  },
];

/** Which preset, if any, the current filters are exactly — so the button can light up. */
export function activePreset(filters: FilterState, today: IsoDate): PresetId | null {
  for (const preset of PRESETS) {
    if (sameFilters(preset.filters(today), filters)) return preset.id;
  }
  return null;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

export function sameFilters(a: FilterState, b: FilterState): boolean {
  return (
    a.search.trim() === b.search.trim() &&
    a.horizonValue === b.horizonValue &&
    a.groupBy === b.groupBy &&
    a.sortBy === b.sortBy &&
    sameList(a.statuses, b.statuses) &&
    sameList(a.horizonTypes, b.horizonTypes) &&
    sameList(a.competencyIds, b.competencyIds) &&
    sameList(a.kinds, b.kinds)
  );
}

/** Adds or removes one value from a filter list — what a checkbox chip does. */
export function toggleValue<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/* ---------------------------------------------------------------- filter chips */

export type ChipOption = { value: string; label: string };
export type ChipKey = 'statuses' | 'horizonTypes' | 'competencyIds' | 'kinds';

export type ChipDef = { key: ChipKey; label: string; options: ChipOption[] };

/** The four chips, in the spec's order: status, horizon, competency, goal kind. */
export function chipDefs(competencies: readonly TableCompetency[]): ChipDef[] {
  return [
    {
      key: 'statuses',
      label: 'Status',
      // Both vocabularies, deduped: `done` is the one value they share, and
      // offering it twice would give two chips that filter to the same rows.
      options: [...new Set<string>([...ITEM_STATUSES, ...GOAL_STATUSES])].map((s) => ({
        value: s,
        label: STATUS_LABEL[s as ItemStatus | GoalStatus],
      })),
    },
    {
      key: 'horizonTypes',
      label: 'Horizon',
      options: HORIZON_TYPES.map((h) => ({ value: h, label: HORIZON_TYPE_LABEL[h] })),
    },
    {
      key: 'competencyIds',
      label: 'Competency',
      options: (competencies.length
        ? [...competencies].sort((a, b) => a.sortOrder - b.sortOrder)
        : COMPETENCY_IDS.map((id, i) => ({ id, name: id, sortOrder: i }))
      ).map((c) => ({ value: c.id, label: c.name })),
    },
    {
      key: 'kinds',
      label: 'Kind',
      options: GOAL_KINDS.map((k) => ({ value: k, label: GOAL_KIND_LABEL[k] })),
    },
  ];
}

/* --------------------------------------------------------------------- summary */

/**
 * The footer readout. Done leads and the denominator follows it quietly — `23`
 * with `of 41 in this view`, never "18 remaining". The master table is the one
 * screen the spec lets show a grand total, so `total` is reported too, but as the
 * smallest figure on the line rather than the headline.
 *
 * `text` is the same sentence as a single string, for a title attribute or any
 * caller that just wants one label.
 */
export function summarize(
  visible: readonly TableRow[],
  total: number,
): { done: number; open: number; shown: number; total: number; text: string } {
  let done = 0;
  for (const row of visible) if (row.status === 'done') done += 1;
  const shown = visible.length;
  const open = shown - done;
  return {
    done,
    open,
    shown,
    total,
    text: `${done} done of ${shown} in this view, ${total} rows in the table`,
  };
}

/** Re-exported so a consumer never has to import two modules to build a filter. */
export { GOAL_STATUSES, GOAL_KINDS, HORIZON_TYPES, ITEM_STATUSES, EFFORTS };
export type { CompetencyId, Effort, GoalKind, GoalStatus, HorizonType, ItemStatus, IsoDate };
