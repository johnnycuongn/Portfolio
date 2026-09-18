'use client';

/**
 * Quick-add. One text box, plain language, and a filled form to confirm.
 *
 * The two rules from the spec that shape everything here:
 *
 *   1. **It always returns a form.** The model call never writes. A wrong guess is
 *      then a one-field fix rather than a reason to stop trusting the box.
 *   2. **Capture never depends on the network.** If the call fails — no key, quota
 *      spent, plane mode — you land on the same form with your text in the title,
 *      and the only difference is a quiet line saying so.
 *
 * Friction scales with rarity: the box asks nothing, and the form asks for exactly
 * two things and only when they are genuinely required — a why-line on a new goal,
 * and a parent goal for a milestone or task.
 *
 * **Shape follows the hand that reaches for it.** On a phone this is a sheet that
 * comes up from the bottom edge: the text box lands under the thumb, the fields
 * scroll, and the two buttons stay pinned above the home indicator, so the thing
 * you press is never the thing that just scrolled away. On a desktop it is an
 * ordinary centred dialog. The same markup does both — only the anchoring changes.
 *
 * Inputs are 16px and 44px tall below `sm`. Both numbers are load-bearing rather
 * than aesthetic: iOS Safari zooms the whole page when it focuses a field smaller
 * than 16px, and a 34px control is a miss waiting to happen on a moving train.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';

import { COMPETENCY_SEED, type HorizonType } from '@/lib/career/types';
import { currentHorizonValue } from '@/lib/career/horizon';
import { useCareerChrome } from '../PanelLayout/CareerChrome';
import {
  coerceDraft,
  draftBlocker,
  emptyDraft,
  DRAFT_OPTIONS,
  type QuickAddDraft,
  type QuickAddKind,
} from './draft';

type GoalOption = { id: string; title: string; status: string; competencyId: string };

type Phase =
  | { kind: 'typing' }
  | { kind: 'parsing' }
  | { kind: 'confirm'; parsed: boolean }
  | { kind: 'saving' };

const KIND_LABELS: Record<QuickAddKind, string> = {
  goal: 'Goal',
  win: 'Win',
  milestone: 'Milestone',
  task: 'Task',
};

const HORIZON_LABELS: Record<HorizonType, string> = {
  none: 'No horizon',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Custom dates',
};

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Local calendar day. Only ever called in the browser, after a click. */
function browserToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

const fieldBase =
  'w-full rounded-md border border-rule bg-surface px-2.5 text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-signal';
/** 44px and 16px on touch, tightened to desktop density from `sm` up. */
const inputClass = `${fieldBase} h-11 text-[16px] sm:h-9 sm:text-[13px]`;
// Native select chrome, deliberately. A hand-drawn arrow is one more thing to get
// wrong in dark mode, on Windows and on a phone, and `color-scheme` on `.ledger`
// already repaints the native one for carbon.
const selectClass = `${inputClass} pr-1`;

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] text-ink-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] leading-snug text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export default function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const chrome = useCareerChrome();
  const reduceMotion = useReducedMotion() ?? false;

  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'typing' });
  const [draft, setDraft] = useState<QuickAddDraft>(() => emptyDraft(browserToday()));
  const [error, setError] = useState<string | null>(null);
  const [goalOptions, setGoalOptions] = useState<GoalOption[]>([]);
  const textRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setText('');
    setPhase({ kind: 'typing' });
    setDraft(emptyDraft(browserToday()));
    setError(null);
  }, []);

  // The goal picker's options, fetched once the box is first opened rather than on
  // every page load — most quick-adds are a goal or a win and never need them.
  useEffect(() => {
    if (!open || goalOptions.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/career/quick-add');
        if (!response.ok) return;
        const body = (await response.json()) as { goals?: GoalOption[] };
        if (!cancelled && Array.isArray(body.goals)) setGoalOptions(body.goals);
      } catch {
        // A missing picker degrades to "you cannot attach a milestone right now",
        // which is far better than a dialog that will not open.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, goalOptions.length]);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => textRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    reset();
  }, [open, reset]);

  // The page behind must not scroll under the sheet — on a phone that reads as the
  // dialog sliding off rather than as the page moving.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes; Tab cycles inside. A modal that lets focus walk out into the
  // page behind it is a modal only for people using a mouse.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const root = panelRef.current;
      if (!root) return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active != null && root.contains(active);

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const runParse = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPhase({ kind: 'parsing' });
    setError(null);

    const today = browserToday();
    try {
      const response = await fetch('/api/career/quick-add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'parse', text: trimmed }),
      });
      if (!response.ok) throw new Error('parse unavailable');
      const body = (await response.json()) as { draft?: unknown; parsed?: boolean };
      setDraft(coerceDraft(body.draft, today));
      setPhase({ kind: 'confirm', parsed: body.parsed === true });
    } catch {
      // The whole point: the form still opens. Your words are in the title.
      setDraft({ ...emptyDraft(today), title: trimmed });
      setPhase({ kind: 'confirm', parsed: false });
    }
  }, [text]);

  const save = useCallback(async () => {
    const blocker = draftBlocker(draft);
    if (blocker) {
      setError(blocker);
      return;
    }
    setPhase({ kind: 'saving' });
    setError(null);

    try {
      const response = await fetch('/api/career/quick-add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'commit', draft }),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || body.ok !== true) {
        setError(body.error ?? 'That could not be saved.');
        setPhase({ kind: 'confirm', parsed: false });
        return;
      }
      chrome?.notify(`Logged “${draft.title}”`);
      onClose();
      router.refresh();
    } catch {
      setError('That could not be saved. Your text is still here.');
      setPhase({ kind: 'confirm', parsed: false });
    }
  }, [chrome, draft, onClose, router]);

  const set = useCallback(<K extends keyof QuickAddDraft>(key: K, value: QuickAddDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }, []);

  const confirming = phase.kind === 'confirm' || phase.kind === 'saving';
  const busy = phase.kind === 'parsing' || phase.kind === 'saving';

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          /* A neutral scrim rather than a token: `ink` inverts between themes and
             would put a white veil over carbon. A dark wash is the one thing that
             means the same in all six, which is why it is an rgba rather than a
             palette colour. */
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,11,14,0.45)] backdrop-blur-[2px] sm:items-start sm:p-6 sm:pt-[9vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-add-heading"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
            className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-rule bg-surface shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:max-h-[82vh] sm:max-w-[620px] sm:rounded-xl"
          >
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;
                if (confirming) void save();
                else void runParse();
              }}
            >
              {/* The capture line. Always visible, never scrolled away. */}
              <div className="shrink-0 border-b border-rule px-4 pb-4 pt-4 sm:px-5">
                <h2 id="quick-add-heading" className="type-display text-[15px] text-ink">
                  Quick add
                </h2>
                <label htmlFor="quick-add-text" className="sr-only">
                  What happened, or what are you taking on?
                </label>
                <input
                  id="quick-add-text"
                  ref={textRef}
                  type="text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Done: shipped the review queue, saves ops ~3 hrs/week"
                  maxLength={400}
                  autoComplete="off"
                  disabled={busy}
                  className="mt-2 w-full border-none bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-faint sm:text-[15px]"
                />
              </div>

              {confirming ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-surface-2 px-4 py-4 sm:px-5">
                  <p className="text-[12.5px] leading-snug text-ink-muted">
                    {phase.kind === 'confirm' && phase.parsed
                      ? `Read as a ${KIND_LABELS[draft.kind].toLowerCase()}. Change anything that is wrong.`
                      : 'The parse did not come back, so here is the plain form. Nothing was lost.'}
                  </p>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <Field label="Type" htmlFor="qa-kind">
                      <select
                        id="qa-kind"
                        className={selectClass}
                        value={draft.kind}
                        onChange={(event) => set('kind', event.target.value as QuickAddKind)}
                      >
                        {DRAFT_OPTIONS.kinds.map((kind) => (
                          <option key={kind} value={kind}>
                            {KIND_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Competency" htmlFor="qa-competency">
                      <select
                        id="qa-competency"
                        className={selectClass}
                        value={draft.competencyId}
                        onChange={(event) =>
                          set('competencyId', event.target.value as QuickAddDraft['competencyId'])
                        }
                      >
                        {COMPETENCY_SEED.map((competency) => (
                          <option key={competency.id} value={competency.id}>
                            {competency.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="Title" htmlFor="qa-title">
                    <input
                      id="qa-title"
                      className={inputClass}
                      value={draft.title}
                      onChange={(event) => set('title', event.target.value)}
                    />
                  </Field>

                  {draft.kind === 'goal' ? (
                    <>
                      <Field
                        label="Why"
                        htmlFor="qa-why"
                        hint="One sentence. The line you read when motivation dips."
                      >
                        <input
                          id="qa-why"
                          className={inputClass}
                          value={draft.why}
                          onChange={(event) => set('why', event.target.value)}
                        />
                      </Field>

                      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                        <Field label="Kind" htmlFor="qa-goal-kind">
                          <select
                            id="qa-goal-kind"
                            className={selectClass}
                            value={draft.goalKind}
                            onChange={(event) =>
                              set('goalKind', event.target.value as QuickAddDraft['goalKind'])
                            }
                          >
                            {DRAFT_OPTIONS.goalKinds.map((kind) => (
                              <option key={kind} value={kind}>
                                {kind}
                              </option>
                            ))}
                          </select>
                        </Field>

                        <Field label="Status" htmlFor="qa-goal-status">
                          <select
                            id="qa-goal-status"
                            className={selectClass}
                            value={draft.goalStatus}
                            onChange={(event) =>
                              set('goalStatus', event.target.value as QuickAddDraft['goalStatus'])
                            }
                          >
                            {DRAFT_OPTIONS.goalStatuses.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </Field>

                        <Field label="Horizon" htmlFor="qa-horizon-type">
                          <select
                            id="qa-horizon-type"
                            className={selectClass}
                            value={draft.horizonType}
                            onChange={(event) => {
                              const horizonType = event.target.value as HorizonType;
                              // "Set a type and the value defaults to the current
                              // period" — never a date you have to think about.
                              setDraft((current) => ({
                                ...current,
                                horizonType,
                                horizonValue: currentHorizonValue(horizonType, new Date()),
                                customStart: horizonType === 'custom' ? current.customStart : null,
                                customEnd: horizonType === 'custom' ? current.customEnd : null,
                              }));
                              setError(null);
                            }}
                          >
                            {DRAFT_OPTIONS.horizonTypes.map((type) => (
                              <option key={type} value={type}>
                                {HORIZON_LABELS[type]}
                              </option>
                            ))}
                          </select>
                        </Field>

                        {draft.horizonType !== 'none' && draft.horizonType !== 'custom' ? (
                          <Field label="Period" htmlFor="qa-horizon-value">
                            <input
                              id="qa-horizon-value"
                              className={inputClass}
                              value={draft.horizonValue ?? ''}
                              placeholder={draft.horizonType === 'quarterly' ? '2026-Q3' : '2026-09'}
                              onChange={(event) => set('horizonValue', event.target.value || null)}
                            />
                          </Field>
                        ) : null}

                        {draft.horizonType === 'custom' ? (
                          <>
                            <Field label="Start" htmlFor="qa-custom-start">
                              <input
                                id="qa-custom-start"
                                type="date"
                                className={inputClass}
                                value={draft.customStart ?? ''}
                                onChange={(event) => set('customStart', event.target.value || null)}
                              />
                            </Field>
                            <Field label="End" htmlFor="qa-custom-end">
                              <input
                                id="qa-custom-end"
                                type="date"
                                className={inputClass}
                                value={draft.customEnd ?? ''}
                                onChange={(event) => set('customEnd', event.target.value || null)}
                              />
                            </Field>
                          </>
                        ) : null}

                        <Field label="Estimated hours" htmlFor="qa-hours">
                          <input
                            id="qa-hours"
                            type="number"
                            min={0}
                            inputMode="numeric"
                            className={inputClass}
                            value={draft.estHours ?? ''}
                            onChange={(event) =>
                              set(
                                'estHours',
                                event.target.value === '' ? null : Number(event.target.value),
                              )
                            }
                          />
                        </Field>

                        <Field label="Cost" htmlFor="qa-cost">
                          <input
                            id="qa-cost"
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            className={inputClass}
                            value={draft.cost ?? ''}
                            onChange={(event) =>
                              set(
                                'cost',
                                event.target.value === '' ? null : Number(event.target.value),
                              )
                            }
                          />
                        </Field>
                      </div>
                    </>
                  ) : null}

                  {draft.kind === 'win' ? (
                    <>
                      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                        <Field label="Happened on" htmlFor="qa-happened">
                          <input
                            id="qa-happened"
                            type="date"
                            className={inputClass}
                            value={draft.happenedOn}
                            onChange={(event) => set('happenedOn', event.target.value)}
                          />
                        </Field>
                        <Field label="Evidence link" htmlFor="qa-evidence">
                          <input
                            id="qa-evidence"
                            className={inputClass}
                            placeholder="PR, doc or dashboard"
                            value={draft.evidenceUrl}
                            onChange={(event) => set('evidenceUrl', event.target.value)}
                          />
                        </Field>
                      </div>
                      <Field
                        label="Impact"
                        htmlFor="qa-impact"
                        hint="Write the number: dollars, latency, hours saved, users served."
                      >
                        <input
                          id="qa-impact"
                          className={inputClass}
                          value={draft.impactNote}
                          onChange={(event) => set('impactNote', event.target.value)}
                        />
                      </Field>
                    </>
                  ) : null}

                  {draft.kind === 'milestone' || draft.kind === 'task' ? (
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      <Field label="Goal" htmlFor="qa-goal">
                        <select
                          id="qa-goal"
                          className={selectClass}
                          value={draft.goalId ?? ''}
                          onChange={(event) => {
                            const goalId = event.target.value || null;
                            const parent = goalOptions.find((g) => g.id === goalId);
                            setDraft((current) => ({
                              ...current,
                              goalId,
                              // A milestone inherits the goal's competency and can
                              // then be overridden — the spec's own wording.
                              competencyId:
                                (parent?.competencyId as QuickAddDraft['competencyId']) ??
                                current.competencyId,
                            }));
                            setError(null);
                          }}
                        >
                          <option value="">Pick a goal…</option>
                          {goalOptions.map((goal) => (
                            <option key={goal.id} value={goal.id}>
                              {goal.title}
                            </option>
                          ))}
                        </select>
                      </Field>

                      {draft.kind === 'task' ? (
                        <Field label="Effort" htmlFor="qa-effort">
                          <select
                            id="qa-effort"
                            className={selectClass}
                            value={draft.effort}
                            onChange={(event) =>
                              set('effort', event.target.value as QuickAddDraft['effort'])
                            }
                          >
                            {DRAFT_OPTIONS.efforts.map((effort) => (
                              <option key={effort} value={effort}>
                                {effort}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : (
                        <Field label="Target date" htmlFor="qa-target">
                          <input
                            id="qa-target"
                            type="date"
                            className={inputClass}
                            value={draft.targetDate ?? ''}
                            onChange={(event) => set('targetDate', event.target.value || null)}
                          />
                        </Field>
                      )}
                    </div>
                  ) : null}

                  {error ? (
                    <p role="alert" className="text-[12.5px] text-overdue">
                      {error}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Pinned. On a phone the fields scroll underneath this and the two
                  decisions stay exactly where your thumb left them. */}
              <div
                className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-rule bg-surface px-4 pt-3 sm:px-5"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
              >
                <span className="order-2 min-w-0 flex-1 basis-full text-[12px] leading-snug text-ink-muted sm:order-1 sm:basis-auto">
                  {confirming
                    ? 'Nothing is written until you press Log it.'
                    : 'Plain language. It comes back as a form to check.'}
                </span>
                <div className="order-1 flex w-full shrink-0 gap-2 sm:order-2 sm:w-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-11 flex-1 rounded-md border border-rule bg-surface px-4 text-[14px] text-ink transition-colors hover:border-rule-strong sm:h-9 sm:flex-none sm:text-[13px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || (confirming ? false : text.trim().length === 0)}
                    className="h-11 flex-1 rounded-md bg-signal px-5 text-[14px] font-medium text-ink-on-signal transition-colors hover:bg-signal-hover disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:flex-none sm:text-[13px]"
                  >
                    {phase.kind === 'parsing'
                      ? 'Reading'
                      : phase.kind === 'saving'
                        ? 'Saving'
                        : confirming
                          ? 'Log it'
                          : 'Continue'}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
