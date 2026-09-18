/**
 * Assertions over the career dashboard's pure logic — horizon.ts and rollup.ts.
 * No database, no framework: this project verifies pure logic with tsx scripts
 * rather than a test runner. Run via `npm run check`.
 */

import assert from 'node:assert/strict';
import {
  currentHorizonValue,
  daysBetween,
  elapsedFraction,
  horizonLabel,
  horizonWindow,
  isPastTarget,
  lastDayOfMonth,
  parseIsoDate,
  quarterOfMonth,
  targetDate,
  targetDateIso,
  toIsoDate,
  utcDate,
} from '../src/lib/career/horizon';
import {
  EMPTY_PROGRESS,
  goalProgress,
  goalSummary,
  milestoneCounts,
  milestoneProgress,
  pace,
  paceBand,
  parentGoalProgress,
  percent,
  progressOf,
  rollupGoalIds,
} from '../src/lib/career/rollup';
import {
  COMPETENCY_IDS,
  COMPETENCY_SEED,
  EFFORT_WEIGHT,
  GOAL_STATUSES,
  type GoalLike,
  type HorizonSpec,
  type MilestoneLike,
  type TaskLike,
} from '../src/lib/career/types';

/* ------------------------------------------------------------------- helpers */

const horizon = (over: Partial<HorizonSpec>): HorizonSpec => ({
  horizonType: 'none',
  horizonValue: null,
  customStart: null,
  customEnd: null,
  ...over,
});

const goal = (over: Partial<GoalLike> & { id: string }): GoalLike => ({
  parentGoalId: null,
  ...horizon({}),
  ...over,
});

const task = (over: Partial<TaskLike> & { goalId: string }): TaskLike => ({
  milestoneId: null,
  status: 'todo',
  effort: 'M',
  ...over,
});

const near = (actual: number | null, expected: number, msg?: string) => {
  assert.ok(actual !== null, msg ?? 'expected a number, got null');
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${msg ?? 'value'}: expected ~${expected}, got ${actual}`,
  );
};

/* ---------------------------------------------------------- date primitives */

assert.equal(toIsoDate(utcDate(2026, 9, 18)), '2026-09-18');
assert.equal(parseIsoDate('2026-09-18')?.getTime(), utcDate(2026, 9, 18).getTime());
assert.equal(parseIsoDate('2026-02-30'), null, 'an impossible day must not roll into March');
assert.equal(parseIsoDate('18/09/2026'), null);
assert.equal(parseIsoDate(''), null);
assert.equal(parseIsoDate(null), null);

// Leap years, the classic off-by-one-day.
assert.equal(toIsoDate(lastDayOfMonth(2024, 2)), '2024-02-29', '2024 is a leap year');
assert.equal(toIsoDate(lastDayOfMonth(2026, 2)), '2026-02-28');
assert.equal(toIsoDate(lastDayOfMonth(2100, 2)), '2100-02-28', '2100 is NOT a leap year');
assert.equal(toIsoDate(lastDayOfMonth(2000, 2)), '2000-02-29', '2000 IS a leap year');
assert.equal(toIsoDate(lastDayOfMonth(2026, 12)), '2026-12-31', 'December must not roll the year');

assert.deepEqual(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(quarterOfMonth),
  [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4],
);
assert.equal(daysBetween(utcDate(2026, 1, 1), utcDate(2026, 1, 31)), 30);
// Crossing a DST boundary in the host's local zone must still be whole days.
assert.equal(daysBetween(utcDate(2026, 3, 28), utcDate(2026, 4, 1)), 4);

/* ------------------------------------------------------------ horizon windows */

// Monthly.
{
  const g = horizon({ horizonType: 'monthly', horizonValue: '2026-09' });
  const w = horizonWindow(g)!;
  assert.equal(toIsoDate(w.start), '2026-09-01');
  assert.equal(toIsoDate(w.end), '2026-09-30');
  assert.equal(targetDateIso(g), '2026-09-30');
  assert.equal(horizonLabel(g), 'Sep 2026');
}
// February in a leap year.
{
  const g = horizon({ horizonType: 'monthly', horizonValue: '2024-02' });
  assert.equal(targetDateIso(g), '2024-02-29');
}

// Quarterly — every boundary, because Q1/Q4 are where quarter maths goes wrong.
{
  const expected: Array<[string, string, string]> = [
    ['2026-Q1', '2026-01-01', '2026-03-31'],
    ['2026-Q2', '2026-04-01', '2026-06-30'],
    ['2026-Q3', '2026-07-01', '2026-09-30'],
    ['2026-Q4', '2026-10-01', '2026-12-31'],
    ['2024-Q1', '2024-01-01', '2024-03-31'], // leap-year Q1 ends 31 Mar regardless
  ];
  for (const [value, start, end] of expected) {
    const w = horizonWindow(horizon({ horizonType: 'quarterly', horizonValue: value }))!;
    assert.equal(toIsoDate(w.start), start, `${value} start`);
    assert.equal(toIsoDate(w.end), end, `${value} end`);
  }
  assert.equal(horizonLabel(horizon({ horizonType: 'quarterly', horizonValue: '2026-Q3' })), 'Q3 2026');
}

// Yearly.
{
  const g = horizon({ horizonType: 'yearly', horizonValue: '2026' });
  const w = horizonWindow(g)!;
  assert.equal(toIsoDate(w.start), '2026-01-01');
  assert.equal(toIsoDate(w.end), '2026-12-31');
  assert.equal(targetDateIso(g), '2026-12-31');
}

// Custom.
{
  const g = horizon({ horizonType: 'custom', customStart: '2026-02-10', customEnd: '2026-03-05' });
  const w = horizonWindow(g)!;
  assert.equal(toIsoDate(w.start), '2026-02-10');
  assert.equal(toIsoDate(w.end), '2026-03-05');
  assert.equal(targetDateIso(g), '2026-03-05');
  assert.equal(horizonLabel(g), 'to 5 Mar');
  assert.equal(
    horizonLabel(horizon({ horizonType: 'yearly', horizonValue: '2026' })),
    '2026',
  );

  // An end with no start is still a deadline, but not a window to pace against.
  const endOnly = horizon({ horizonType: 'custom', customEnd: '2026-03-05' });
  assert.equal(targetDateIso(endOnly), '2026-03-05');
  assert.equal(horizonWindow(endOnly), null);
  assert.equal(elapsedFraction(endOnly, utcDate(2026, 3, 1)), null);

  // Backwards dates are not a window.
  assert.equal(
    horizonWindow(horizon({ horizonType: 'custom', customStart: '2026-05-01', customEnd: '2026-04-01' })),
    null,
  );
}

// None, and malformed values, degrade to "no horizon" rather than throwing.
{
  const none = horizon({});
  assert.equal(targetDate(none), null);
  assert.equal(horizonWindow(none), null);
  assert.equal(elapsedFraction(none, utcDate(2026, 9, 18)), null);
  assert.equal(horizonLabel(none), 'No horizon');
  assert.equal(isPastTarget(none, utcDate(2099, 1, 1)), false, 'a goal with no horizon is never late');

  for (const bad of ['2026-13', '2026-Q5', 'soon', '26-09', '']) {
    const g = horizon({ horizonType: 'monthly', horizonValue: bad });
    assert.equal(horizonWindow(g), null, `monthly '${bad}' must not parse`);
    assert.equal(elapsedFraction(g, utcDate(2026, 9, 18)), null);
  }
}

/* ---------------------------------------------------------- elapsed fraction */

{
  const q3 = horizon({ horizonType: 'quarterly', horizonValue: '2026-Q3' }); // 92 days
  assert.equal(daysBetween(utcDate(2026, 7, 1), utcDate(2026, 9, 30)) + 1, 92);

  near(elapsedFraction(q3, utcDate(2026, 7, 1)), 1 / 92, 'first day counts as elapsed');
  near(elapsedFraction(q3, utcDate(2026, 9, 30)), 1, 'last day is fully elapsed');
  assert.equal(elapsedFraction(q3, utcDate(2026, 6, 30)), 0, 'before the window is 0');
  assert.equal(elapsedFraction(q3, utcDate(2027, 1, 1)), 1, 'after the window is 1');
  near(elapsedFraction(q3, utcDate(2026, 8, 15)), 46 / 92, 'midpoint');

  // A time-of-day component must not change the answer — dates are calendar days.
  near(
    elapsedFraction(q3, new Date(Date.UTC(2026, 7, 15, 23, 59, 59))),
    46 / 92,
    'time of day is ignored',
  );

  // A one-day custom window is fully elapsed on its only day, never a divide-by-zero.
  const oneDay = horizon({ horizonType: 'custom', customStart: '2026-05-05', customEnd: '2026-05-05' });
  assert.equal(elapsedFraction(oneDay, utcDate(2026, 5, 5)), 1);
}

// isPastTarget is about a real date having passed, not about being slow.
{
  const g = horizon({ horizonType: 'monthly', horizonValue: '2026-09' });
  assert.equal(isPastTarget(g, utcDate(2026, 9, 30)), false, 'the target day itself is not past');
  assert.equal(isPastTarget(g, utcDate(2026, 10, 1)), true);
}

/* ------------------------------------------------------ current horizon value */

{
  const today = utcDate(2026, 9, 18);
  assert.equal(currentHorizonValue('monthly', today), '2026-09');
  assert.equal(currentHorizonValue('quarterly', today), '2026-Q3');
  assert.equal(currentHorizonValue('yearly', today), '2026');
  assert.equal(currentHorizonValue('none', today), null);
  assert.equal(currentHorizonValue('custom', today), null);
  assert.equal(currentHorizonValue('monthly', utcDate(2026, 1, 5)), '2026-01', 'month is zero-padded');
  assert.equal(currentHorizonValue('quarterly', utcDate(2026, 12, 31)), '2026-Q4');
}

/* --------------------------------------------------------------- task rollup */

// Zero tasks: 0%, never NaN. This is the ordinary state of a brand-new goal.
{
  const empty = goalProgress('g1', []);
  assert.deepEqual(empty, EMPTY_PROGRESS);
  assert.equal(Number.isNaN(empty.fraction), false);
  assert.equal(empty.fraction, 0);
  assert.equal(percent(empty.fraction), 0);
  assert.deepEqual(milestoneCounts('g1', []), { done: 0, total: 0 });
}

// Flat count across the goal: tasks under a milestone and tasks without one count
// the same, so a five-task milestone outweighs a one-task milestone.
{
  const tasks: TaskLike[] = [
    task({ goalId: 'g1', milestoneId: 'm1', status: 'done' }),
    task({ goalId: 'g1', milestoneId: 'm1', status: 'done' }),
    task({ goalId: 'g1', milestoneId: 'm1', status: 'todo' }),
    task({ goalId: 'g1', milestoneId: 'm1', status: 'todo' }),
    task({ goalId: 'g1', milestoneId: 'm1', status: 'doing' }),
    task({ goalId: 'g1', milestoneId: 'm2', status: 'done' }),
    task({ goalId: 'g1', milestoneId: null, status: 'todo' }),
    task({ goalId: 'other', milestoneId: null, status: 'done' }), // another goal
  ];

  const g = goalProgress('g1', tasks);
  assert.equal(g.doneCount, 3);
  assert.equal(g.totalCount, 7, "another goal's tasks must not leak in");
  near(g.fraction, 3 / 7);

  const m1 = milestoneProgress('m1', tasks);
  assert.equal(m1.doneCount, 2);
  assert.equal(m1.totalCount, 5);
  near(m1.fraction, 2 / 5);

  const m2 = milestoneProgress('m2', tasks);
  near(m2.fraction, 1, 'a one-task milestone is 100% when that task is done');

  // …and the flat goal count is NOT the average of the two milestones (3/7 vs 7/10).
  assert.notEqual(g.fraction, (m1.fraction + m2.fraction) / 2);

  // 'doing' is not 'done'.
  assert.equal(progressOf([task({ goalId: 'g1', status: 'doing' })]).fraction, 0);
}

/* ------------------------------------------------------------ effort weighting */

{
  assert.deepEqual(EFFORT_WEIGHT, { S: 1, M: 3, L: 5 });

  const tasks: TaskLike[] = [
    task({ goalId: 'g1', effort: 'S', status: 'done' }), // 1
    task({ goalId: 'g1', effort: 'S', status: 'done' }), // 1
    task({ goalId: 'g1', effort: 'L', status: 'todo' }), // 5
  ];

  const off = goalProgress('g1', tasks);
  near(off.fraction, 2 / 3, 'weighting is off by default');
  assert.equal(off.done, 2);
  assert.equal(off.total, 3);

  const on = goalProgress('g1', tasks, { weightByEffort: true });
  near(on.fraction, 2 / 7, 'two small tasks done against one large one outstanding');
  assert.equal(on.done, 2);
  assert.equal(on.total, 7);
  // Counts stay honest regardless of weighting — `2/3 tasks` either way.
  assert.equal(on.doneCount, 2);
  assert.equal(on.totalCount, 3);

  // An unrecognised effort falls back to weight 1 rather than producing NaN.
  const odd = progressOf([task({ goalId: 'g1', effort: 'XL', status: 'done' })], {
    weightByEffort: true,
  });
  assert.equal(odd.total, 1);
  assert.equal(odd.fraction, 1);
}

/* ------------------------------------------------------------- parent rollup */

{
  const goals: GoalLike[] = [
    goal({ id: 'parent', horizonType: 'yearly', horizonValue: '2026' }),
    goal({ id: 'childA', parentGoalId: 'parent' }),
    goal({ id: 'childB', parentGoalId: 'parent' }),
    goal({ id: 'unrelated' }),
  ];

  const tasks: TaskLike[] = [
    task({ goalId: 'parent', status: 'done' }),
    task({ goalId: 'parent', status: 'todo' }),
    task({ goalId: 'childA', status: 'done' }),
    task({ goalId: 'childA', status: 'done' }),
    task({ goalId: 'childB', status: 'todo' }),
    task({ goalId: 'unrelated', status: 'done' }),
  ];

  assert.deepEqual(rollupGoalIds('parent', goals), ['parent', 'childA', 'childB']);

  const rolled = parentGoalProgress('parent', goals, tasks);
  assert.equal(rolled.doneCount, 3);
  assert.equal(rolled.totalCount, 5, "an unrelated goal's tasks stay out");
  near(rolled.fraction, 3 / 5);

  // The parent's own tasks alone are only 1/2 — the rollup is the whole point.
  near(goalProgress('parent', tasks).fraction, 1 / 2);

  // A leaf goal rolls up to exactly itself, so screens can call this unconditionally.
  assert.deepEqual(
    parentGoalProgress('childA', goals, tasks),
    goalProgress('childA', tasks),
  );

  // One level only: a grandchild does not climb to the top.
  const deep: GoalLike[] = [...goals, goal({ id: 'grandchild', parentGoalId: 'childA' })];
  const deepTasks: TaskLike[] = [...tasks, task({ goalId: 'grandchild', status: 'done' })];
  assert.equal(parentGoalProgress('parent', deep, deepTasks).totalCount, 5);
  assert.equal(parentGoalProgress('childA', deep, deepTasks).totalCount, 3);
}

/* ------------------------------------------------------------- pace and bands */

{
  // Null in, null out: a goal with no horizon has no pace, ever.
  assert.equal(pace(0.1, null), null);
  assert.equal(paceBand(null), 'none');

  near(pace(0.5, 0.25), 0.25);
  near(pace(0.25, 0.5), -0.25);

  assert.equal(paceBand(0.2), 'ahead');
  assert.equal(paceBand(0), 'ahead', 'exactly on pace is on time, not behind');
  assert.equal(paceBand(-0.05), 'slightly-behind');
  assert.equal(paceBand(-0.15), 'behind', 'the boundary belongs to the worse band');
  assert.equal(paceBand(-0.4), 'behind');
}

/* ------------------------------------------------------------- goal summary */

// A horizon-less goal: progress only, no pace, no band, never late.
{
  const g = goal({ id: 'g1' });
  const tasks: TaskLike[] = [
    task({ goalId: 'g1', status: 'done' }),
    task({ goalId: 'g1', status: 'todo' }),
    task({ goalId: 'g1', status: 'todo' }),
    task({ goalId: 'g1', status: 'todo' }),
  ];

  const s = goalSummary(g, [g], [], tasks, utcDate(2026, 9, 18));
  near(s.progress.fraction, 0.25);
  assert.equal(s.elapsed, null);
  assert.equal(s.pace, null);
  assert.equal(s.paceBand, 'none');
  assert.equal(s.pastTarget, false);
}

// A quarterly goal, mid-quarter, behind.
{
  const g = goal({ id: 'g1', horizonType: 'quarterly', horizonValue: '2026-Q3' });
  const milestones: MilestoneLike[] = [
    { id: 'm1', goalId: 'g1', status: 'done' },
    { id: 'm2', goalId: 'g1', status: 'doing' },
    { id: 'm3', goalId: 'g1', status: 'todo' },
    { id: 'mX', goalId: 'other', status: 'done' },
  ];
  const tasks: TaskLike[] = [
    task({ goalId: 'g1', milestoneId: 'm1', status: 'done' }),
    task({ goalId: 'g1', milestoneId: 'm2', status: 'todo' }),
    task({ goalId: 'g1', milestoneId: 'm3', status: 'todo' }),
    task({ goalId: 'g1', milestoneId: 'm3', status: 'todo' }),
  ];

  const s = goalSummary(g, [g], milestones, tasks, utcDate(2026, 8, 15));
  near(s.progress.fraction, 0.25);
  assert.deepEqual(s.milestones, { done: 1, total: 3 });
  near(s.elapsed, 46 / 92);
  near(s.pace, 0.25 - 46 / 92);
  assert.equal(s.paceBand, 'behind');
  assert.equal(s.pastTarget, false);
}

// Past its target and unfinished reads as behind however small the arithmetic gap.
{
  const g = goal({ id: 'g1', horizonType: 'monthly', horizonValue: '2026-09' });
  const tasks: TaskLike[] = [
    task({ goalId: 'g1', status: 'done' }),
    task({ goalId: 'g1', status: 'done' }),
    task({ goalId: 'g1', status: 'done' }),
    task({ goalId: 'g1', status: 'todo' }),
  ];

  const s = goalSummary(g, [g], [], tasks, utcDate(2026, 10, 5));
  assert.equal(s.elapsed, 1);
  near(s.pace, -0.25);
  assert.equal(s.pastTarget, true);
  assert.equal(s.paceBand, 'behind');

  // Finished on time, read after the window closed: complete, not behind.
  const doneTasks = tasks.map((t) => ({ ...t, status: 'done' as const }));
  const finished = goalSummary(g, [g], [], doneTasks, utcDate(2026, 10, 5));
  assert.equal(finished.progress.fraction, 1);
  assert.equal(finished.paceBand, 'ahead', 'a completed goal is never marked behind');
}

// Weighting flows through the summary.
{
  const g = goal({ id: 'g1', horizonType: 'yearly', horizonValue: '2026' });
  const tasks: TaskLike[] = [
    task({ goalId: 'g1', effort: 'L', status: 'done' }),
    task({ goalId: 'g1', effort: 'S', status: 'todo' }),
  ];
  near(goalSummary(g, [g], [], tasks, utcDate(2026, 1, 1)).progress.fraction, 0.5);
  near(
    goalSummary(g, [g], [], tasks, utcDate(2026, 1, 1), { weightByEffort: true }).progress.fraction,
    5 / 6,
  );
}

/* ---------------------------------------------------------------- value sets */

{
  assert.equal(COMPETENCY_SEED.length, 5, 'five rows, fixed forever');
  assert.deepEqual(
    COMPETENCY_SEED.map((c) => c.id),
    [...COMPETENCY_IDS],
  );
  assert.equal(new Set(COMPETENCY_SEED.map((c) => c.sortOrder)).size, 5, 'sort order is unique');
  assert.deepEqual([...GOAL_STATUSES], ['active', 'paused', 'backlog', 'done', 'dropped']);
}

console.log('check-career-logic: ok');
