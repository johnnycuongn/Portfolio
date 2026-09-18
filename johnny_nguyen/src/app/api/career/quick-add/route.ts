/**
 * Quick-add: parse, then commit.
 *
 * Capture friction is what kills trackers, so this route has one job and one
 * promise. The job: turn a line of plain language into a filled form. The promise:
 * **it never writes on a parse.** `action: 'parse'` is read-only and always answers
 * 200 with a draft — model down, key missing, quota spent, JSON mangled, it makes no
 * difference, you get a form. Writing happens only on an explicit `action: 'commit'`
 * of a draft a human has looked at.
 *
 * Both actions are admin-gated. Parsing is gated too, not because a draft is secret
 * but because an ungated parse endpoint is a free model-quota tap for anyone with
 * the URL.
 */

import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

import { adminOnly } from '@/lib/career/auth';
import { isProviderConfigured } from '@/app/_ai/provider';
import { db } from '@/lib/db';
import { goals, milestones, tasks, wins } from '@/lib/db/schema';
import { COMPETENCY_SEED } from '@/lib/career/types';
import { currentHorizonValue, toIsoDate } from '@/lib/career/horizon';
import {
  coerceDraft,
  draftBlocker,
  fallbackDraft,
  type QuickAddDraft,
} from '@/app/career/_components/QuickAdd/draft';
import { getAttachableGoals } from '@/app/career/_queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT = 400;

/* --------------------------------------------------------------- the parser */

/**
 * The two providers the repo already has keys for, in the order `_ai/provider.ts`
 * tries them, and for the same reason: Gemini's free tier is measured in hundreds of
 * thousands of tokens a minute against Groq's twelve thousand.
 *
 * This is a plain non-streaming call rather than `streamCompletion`, because that
 * function hard-codes the portfolio's system prompt through `buildSystemPrompt`, and
 * its `PromptSurface` union lives in a file this agent does not own. The endpoints,
 * the env var names and the ordering are the same; only the prompt differs.
 */
const PROVIDERS = [
  {
    name: 'gemini',
    envKey: 'GEMINI_AI_API_KEY',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: () => process.env.GEMINI_MODEL || 'gemini-flash-latest',
  },
  {
    name: 'groq',
    envKey: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
] as const;

/** A wrong guess costs one field. A slow guess costs the whole point of quick-add. */
const PARSE_TIMEOUT_MS = 8000;

function systemPrompt(today: string): string {
  const competencyList = COMPETENCY_SEED.map((c) => `${c.id} (${c.name})`).join(', ');

  return [
    'You turn one line of plain language from a career ledger into a JSON object.',
    'Reply with the JSON object and nothing else. No prose, no code fences.',
    '',
    'Fields:',
    '  kind: "goal" | "win" | "milestone" | "task"',
    '    - "win" for something that already happened and was not planned.',
    '    - "goal" for something being aimed at.',
    '    - "milestone" or "task" only when the text clearly names an existing goal.',
    '  title: string, phrased as an outcome, no leading "Done:" or "Learn".',
    `  competencyId: one of ${competencyList}`,
    '  why: string, only if the text gives a reason. Otherwise "".',
    '  goalKind: "skill" | "certification" | "domain" | "role" | "project"',
    '  goalStatus: "active" | "backlog". Use "backlog" when the text says backlog, later or someday.',
    '  horizonType: "none" | "monthly" | "quarterly" | "yearly" | "custom"',
    '  horizonValue: "2026-09" for monthly, "2026-Q3" for quarterly, "2026" for yearly.',
    '    MUST be null when horizonType is "none" or "custom".',
    '  customStart, customEnd, targetDate, happenedOn: "YYYY-MM-DD" or null.',
    '  estHours: number or null. cost: number or null (dollars, no symbol).',
    '  impactNote: for a win, the number where one exists. Otherwise "".',
    '  evidenceUrl: a URL if one appears in the text, otherwise "".',
    '  effort: "S" | "M" | "L". Default "M".',
    '',
    `Today is ${today}. Prefer horizonType "none" when the text names no period —`,
    'a goal with no deadline is normal and is never judged on pace.',
    'Never invent a why-line, a number or a date that is not in the text.',
  ].join('\n');
}

function extractJson(raw: string): unknown {
  const withoutFence = raw.replace(/```(?:json)?/gi, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** One provider, one shot. Returns null on any failure — the caller falls through. */
async function askProvider(
  provider: (typeof PROVIDERS)[number],
  text: string,
  today: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env[provider.envKey]}`,
    },
    body: JSON.stringify({
      model: provider.model(),
      // Gemini's flash models spend part of this budget on hidden reasoning that
      // never reaches the response, so a tight cap truncates the JSON mid-object.
      max_tokens: 1200,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt(today) },
        { role: 'user', content: text },
      ],
    }),
  });

  if (!response.ok) return null;
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  return typeof content === 'string' ? extractJson(content) : null;
}

/**
 * Always resolves. `parsed: false` means the form opened from the text alone, which
 * is a normal outcome and not an error worth showing anyone.
 */
async function parse(text: string, today: string): Promise<{ draft: QuickAddDraft; parsed: boolean }> {
  const fallback = fallbackDraft(text, today);
  if (!isProviderConfigured()) return { draft: fallback, parsed: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

  try {
    for (const provider of PROVIDERS) {
      if (!process.env[provider.envKey]) continue;
      try {
        const raw = await askProvider(provider, text, today, controller.signal);
        if (!raw) continue;
        const draft = coerceDraft(raw, today);
        // A parse that produced no title is not a parse. Keep the typed text.
        if (!draft.title.trim()) draft.title = fallback.title;
        return { draft, parsed: true };
      } catch (error) {
        if (controller.signal.aborted) break;
        console.error(`career/quick-add: ${provider.name} parse failed`, error);
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  return { draft: fallback, parsed: false };
}

/* --------------------------------------------------------------- the writer */

async function commit(draft: QuickAddDraft): Promise<{ kind: string; id: string }> {
  const id = uuid();
  const now = new Date();

  if (draft.kind === 'win') {
    await db.insert(wins).values({
      id,
      title: draft.title,
      happenedOn: draft.happenedOn,
      competencyId: draft.competencyId,
      impactNote: draft.impactNote,
      evidenceUrl: draft.evidenceUrl || null,
      createdAt: now,
      updatedAt: now,
    });
    return { kind: 'win', id };
  }

  if (draft.kind === 'goal') {
    await db.insert(goals).values({
      id,
      title: draft.title,
      why: draft.why,
      horizonType: draft.horizonType,
      // The schema's CHECK insists these agree. `coerceDraft` already nulls the
      // value for none/custom; this fills the other direction, so picking
      // "quarterly" and leaving the period blank lands on the current quarter
      // rather than on a constraint violation.
      horizonValue:
        draft.horizonType === 'none' || draft.horizonType === 'custom'
          ? null
          : (draft.horizonValue ?? currentHorizonValue(draft.horizonType, now)),
      customStart: draft.horizonType === 'custom' ? draft.customStart : null,
      customEnd: draft.horizonType === 'custom' ? draft.customEnd : null,
      kind: draft.goalKind,
      status: draft.goalStatus,
      competencyId: draft.competencyId,
      // Entering Active is what sets the start date; a backlog goal has not started.
      startedOn: draft.goalStatus === 'active' ? toIsoDate(now) : null,
      estHours: draft.estHours,
      cost: draft.cost,
      createdAt: now,
      updatedAt: now,
    });
    return { kind: 'goal', id };
  }

  // Milestone and task both hang off a goal that must already exist.
  const goalId = draft.goalId as string;
  const parent = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
  if (parent.length === 0) throw new Error('That goal no longer exists.');

  if (draft.kind === 'milestone') {
    const siblings = await db.select().from(milestones).where(eq(milestones.goalId, goalId));
    const sortOrder = siblings.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1;

    await db.insert(milestones).values({
      id,
      goalId,
      title: draft.title,
      sortOrder,
      // Always todo. A milestone cannot be born done — done needs evidence, and
      // evidence is the one thing worth asking for.
      status: 'todo',
      competencyId: draft.competencyId || parent[0].competencyId,
      evidenceUrl: draft.evidenceUrl || null,
      evidenceNote: draft.evidenceNote || null,
      targetDate: draft.targetDate,
      createdAt: now,
      updatedAt: now,
    });
    return { kind: 'milestone', id };
  }

  await db.insert(tasks).values({
    id,
    goalId,
    milestoneId: null,
    title: draft.title,
    status: 'todo',
    effort: draft.effort,
    createdAt: now,
    updatedAt: now,
  });
  return { kind: 'task', id };
}

/* ------------------------------------------------------------------- routes */

/** The goal picker's options. Admin-only, like everything else on this route. */
export async function GET() {
  const denied = await adminOnly();
  if (denied) return denied;

  try {
    return Response.json({ ok: true, goals: await getAttachableGoals() });
  } catch (error) {
    console.error('career/quick-add: goal list failed', error);
    return Response.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await adminOnly();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'bad request' }, { status: 400 });
  }

  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const today = toIsoDate(new Date());

  if (input.action === 'parse') {
    const text = typeof input.text === 'string' ? input.text.trim().slice(0, MAX_TEXT) : '';
    if (!text) return Response.json({ ok: false, error: 'nothing to parse' }, { status: 400 });

    const { draft, parsed } = await parse(text, today);
    return Response.json({ ok: true, draft, parsed });
  }

  if (input.action === 'commit') {
    // Re-coerced server-side: the client's draft is a suggestion, never trusted.
    const draft = coerceDraft(input.draft, today);
    const blocker = draftBlocker(draft);
    if (blocker) return Response.json({ ok: false, error: blocker }, { status: 400 });

    try {
      const result = await commit(draft);
      return Response.json({ ok: true, ...result });
    } catch (error) {
      console.error('career/quick-add: commit failed', error);
      const message =
        error instanceof Error && error.message === 'That goal no longer exists.'
          ? error.message
          : 'That could not be saved.';
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  }

  return Response.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
