/**
 * Quick-add's shared shape: what the model is asked to produce, what the form
 * renders, and what the route writes. One type, three places, so a wrong guess is a
 * one-field fix rather than a mistrust problem.
 *
 * Pure and dependency-free — imported by the client dialog and by the route handler
 * both, so it must not reach for `node:` anything.
 *
 * The contract the whole feature rests on: **the parse never writes.** It always
 * returns a filled form to confirm. That is what makes a wrong guess cheap, and it
 * is also what makes the network optional — `fallbackDraft` produces the same shape
 * with nothing but the text you typed, so capture works with the model down, the
 * key missing, or the plane in the air.
 */

import {
  COMPETENCY_IDS,
  EFFORTS,
  GOAL_KINDS,
  HORIZON_TYPES,
  isCompetencyId,
  isEffort,
  isGoalKind,
  isHorizonType,
  type CompetencyId,
  type Effort,
  type GoalKind,
  type HorizonType,
  type IsoDate,
} from '@/lib/career/types';

export const QUICK_ADD_KINDS = ['goal', 'win', 'milestone', 'task'] as const;
export type QuickAddKind = (typeof QUICK_ADD_KINDS)[number];

/** Quick-add only ever creates a goal you are starting or one you are parking. */
export const QUICK_ADD_GOAL_STATUSES = ['active', 'backlog'] as const;
export type QuickAddGoalStatus = (typeof QUICK_ADD_GOAL_STATUSES)[number];

export type QuickAddDraft = {
  kind: QuickAddKind;
  title: string;
  competencyId: CompetencyId;

  /* goal */
  why: string;
  goalKind: GoalKind;
  goalStatus: QuickAddGoalStatus;
  horizonType: HorizonType;
  horizonValue: string | null;
  customStart: IsoDate | null;
  customEnd: IsoDate | null;
  estHours: number | null;
  cost: number | null;

  /* win */
  happenedOn: IsoDate;
  impactNote: string;

  /* milestone and task */
  goalId: string | null;
  effort: Effort;
  targetDate: IsoDate | null;

  /* evidence, shared by wins and milestones */
  evidenceUrl: string;
  evidenceNote: string;
};

/** The empty form — what you get when the model call fails and you fill it yourself. */
export function emptyDraft(today: IsoDate): QuickAddDraft {
  return {
    kind: 'goal',
    title: '',
    competencyId: 'technical_judgment',
    why: '',
    goalKind: 'skill',
    goalStatus: 'active',
    horizonType: 'none',
    horizonValue: null,
    customStart: null,
    customEnd: null,
    estHours: null,
    cost: null,
    happenedOn: today,
    impactNote: '',
    goalId: null,
    effort: 'M',
    targetDate: null,
    evidenceUrl: '',
    evidenceNote: '',
  };
}

/**
 * The offline fallback.
 *
 * One rule, not a parser: text that opens with "done"/"shipped"/"won" is something
 * that already happened, so it is a win; everything else is a goal. Resisting a
 * cleverer regex here is deliberate — an offline heuristic that is right 60% of the
 * time is worse than an empty form, because you stop reading the fields.
 */
export function fallbackDraft(text: string, today: IsoDate): QuickAddDraft {
  const trimmed = text.trim();
  const isDone = /^(done|did|shipped|won|finished|completed)\b[:\s]/i.test(trimmed);
  return {
    ...emptyDraft(today),
    kind: isDone ? 'win' : 'goal',
    // Strip the leading verb, so "Done: shipped X" becomes "shipped X".
    title: isDone ? trimmed.replace(/^\w+\b[:\s]+/, '') : trimmed,
  };
}

/* ------------------------------------------------------------------ coercion */

function str(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function nullableIso(value: unknown): IsoDate | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? value.trim()
    : null;
}

function nullableNumber(value: unknown, max: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

/**
 * Whatever a model returned, turned into a draft that is safe to render and safe to
 * insert. Every field falls back to the empty draft's value, so a model that omits
 * half the object, invents an enum value or returns a string where a number belongs
 * produces a slightly-less-filled form rather than a crash or a bad row.
 */
export function coerceDraft(raw: unknown, today: IsoDate): QuickAddDraft {
  const base = emptyDraft(today);
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Record<string, unknown>;

  const kind = (QUICK_ADD_KINDS as readonly string[]).includes(String(input.kind))
    ? (input.kind as QuickAddKind)
    : base.kind;

  const horizonType: HorizonType = isHorizonType(input.horizonType)
    ? input.horizonType
    : base.horizonType;

  // The schema's CHECK enforces this exactly: a value for the three periodic types,
  // null for none and custom. Getting it wrong here is a 500 at insert time.
  const horizonValue =
    horizonType === 'none' || horizonType === 'custom' ? null : str(input.horizonValue, 16) || null;

  const goalStatus = (QUICK_ADD_GOAL_STATUSES as readonly string[]).includes(String(input.goalStatus))
    ? (input.goalStatus as QuickAddGoalStatus)
    : base.goalStatus;

  return {
    kind,
    title: str(input.title, 300) || base.title,
    competencyId: isCompetencyId(input.competencyId) ? input.competencyId : base.competencyId,

    why: str(input.why, 500),
    goalKind: isGoalKind(input.goalKind) ? input.goalKind : base.goalKind,
    goalStatus,
    horizonType,
    horizonValue,
    customStart: horizonType === 'custom' ? nullableIso(input.customStart) : null,
    customEnd: horizonType === 'custom' ? nullableIso(input.customEnd) : null,
    estHours: nullableNumber(input.estHours, 10_000),
    cost: nullableNumber(input.cost, 1_000_000),

    happenedOn: nullableIso(input.happenedOn) ?? today,
    impactNote: str(input.impactNote, 500),

    goalId: str(input.goalId, 64) || null,
    effort: isEffort(input.effort) ? input.effort : base.effort,
    targetDate: nullableIso(input.targetDate),

    evidenceUrl: str(input.evidenceUrl, 500),
    evidenceNote: str(input.evidenceNote, 500),
  };
}

/**
 * Why a draft cannot be saved yet, or null when it can.
 *
 * Only two things are ever demanded, and both are the spec's "friction scales with
 * rarity": a why-line on a new goal, because a goal without one rots in the list,
 * and a parent goal for a milestone or task, because there is nowhere to put it
 * otherwise. Everything else has a sane default.
 */
export function draftBlocker(draft: QuickAddDraft): string | null {
  if (!draft.title.trim()) return 'Give it a title.';
  if (draft.kind === 'goal' && !draft.why.trim()) {
    return 'One sentence on why this goal exists — that is the line you read when motivation dips.';
  }
  if ((draft.kind === 'milestone' || draft.kind === 'task') && !draft.goalId) {
    return 'Pick the goal this belongs to.';
  }
  return null;
}

/** The value sets the form's selects render, re-exported so the dialog imports once. */
export const DRAFT_OPTIONS = {
  kinds: QUICK_ADD_KINDS,
  goalKinds: GOAL_KINDS,
  goalStatuses: QUICK_ADD_GOAL_STATUSES,
  horizonTypes: HORIZON_TYPES,
  competencies: COMPETENCY_IDS,
  efforts: EFFORTS,
} as const;
