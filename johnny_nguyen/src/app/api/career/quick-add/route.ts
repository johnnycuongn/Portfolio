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

import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { after } from 'next/server';
import { v4 as uuid } from 'uuid';

import { notifyClaudeParseFailure } from '@/lib/career/alerts';
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

/**
 * Claude is tried before the two above. It is a better parser for this job — the
 * task is mostly judgement (is this a win or a goal? is there really a why-line in
 * there, or am I inventing one?) rather than extraction — and the other two stay
 * underneath it on purpose.
 *
 * The credential here is an OAuth token, which is short-lived by nature: it will
 * expire, and when it does this call starts failing. That is precisely why Gemini
 * and Groq are still in the list. An expired token costs a slightly worse parse,
 * not a broken quick-add, and the form still opens either way.
 *
 * OAuth tokens travel as `Authorization: Bearer` with a beta header, not as
 * `x-api-key` — swapping this for a console API key later is a credential change
 * AND a header change. The SDK reads ANTHROPIC_AUTH_TOKEN from the environment on
 * its own; it is named explicitly here so the dependency is greppable.
 */
const CLAUDE = {
  model: 'claude-sonnet-5',
  /** The level asked for: enough judgement for the call, not enough to be slow. */
  effort: 'medium',
  envKey: 'ANTHROPIC_AUTH_TOKEN',
  oauthBeta: 'oauth-2025-04-20',
} as const;

/**
 * A wrong guess costs one field. A slow guess costs the whole point of quick-add.
 *
 * Twelve rather than eight: Sonnet runs adaptive thinking, so a parse is a little
 * slower than the flash models were, and the budget has to cover the fall-through
 * to Gemini underneath it. The box opens immediately regardless — this is the wait
 * before the fields fill in, not a wait before anything appears.
 */
const PARSE_TIMEOUT_MS = 12000;

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

/**
 * Claude, one shot. Returns null on any failure so the caller falls through to the
 * OpenAI-shaped providers below — an expired OAuth token looks like any other
 * failure here, which is the intended behaviour.
 *
 * `max_tokens` is well above what the JSON needs because adaptive thinking spends
 * part of the same budget; a tight cap truncates the object mid-field rather than
 * failing cleanly, and a truncated parse is worse than no parse.
 */
async function askClaude(text: string, today: string, signal: AbortSignal): Promise<unknown> {
  const client = new Anthropic({
    authToken: process.env[CLAUDE.envKey],
    defaultHeaders: { 'anthropic-beta': CLAUDE.oauthBeta },
  });

  const response = await client.messages.create(
    {
      model: CLAUDE.model,
      max_tokens: 4000,
      system: systemPrompt(today),
      messages: [{ role: 'user', content: text }],
      output_config: { effort: CLAUDE.effort },
    },
    { signal },
  );

  // A safety decline is a legitimate outcome, not an exception. Fall through.
  if (response.stop_reason === 'refusal') return null;

  const parts = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text);

  return parts.length > 0 ? extractJson(parts.join('')) : null;
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
  const hasClaude = Boolean(process.env[CLAUDE.envKey]);
  // `isProviderConfigured` only knows about Gemini and Groq, and it is shared with
  // /ask — so ask it, but do not let it veto a Claude-only deployment.
  if (!hasClaude && !isProviderConfigured()) return { draft: fallback, parsed: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

  /** A parse that produced no title is not a parse. Keep the typed text. */
  const accept = (raw: unknown) => {
    const draft = coerceDraft(raw, today);
    if (!draft.title.trim()) draft.title = fallback.title;
    return { draft, parsed: true as const };
  };

  try {
    if (hasClaude) {
      try {
        const raw = await askClaude(text, today, controller.signal);
        if (raw) return accept(raw);
      } catch (error) {
        // An expired OAuth token lands here as a 401 and is indistinguishable
        // from any other failure, by design — log it and drop to the next
        // provider rather than failing the request.
        if (!controller.signal.aborted) {
          console.error('career/quick-add: claude parse failed', error);
          // `after` runs once the response has been sent, so the owner's alert
          // costs the person typing nothing. The alert is throttled internally;
          // calling it on every failure is the intended usage.
          after(() => notifyClaudeParseFailure(error));
        }
      }
    }

    for (const provider of PROVIDERS) {
      if (!process.env[provider.envKey]) continue;
      try {
        const raw = await askProvider(provider, text, today, controller.signal);
        if (!raw) continue;
        return accept(raw);
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
