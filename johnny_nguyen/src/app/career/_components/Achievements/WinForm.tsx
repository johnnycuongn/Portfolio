'use client';

/**
 * Logging a win — an achievement nothing planned.
 *
 * You ran an incident. You mentored someone through a promotion. You made an
 * architecture call that stuck and talked a team out of a second queue. None of
 * these came from a goal, none of them will ever appear in a progress bar, and the
 * spec is blunt that they are often the best promotion evidence you have.
 *
 * Two things this form exists to do, beyond storing a row:
 *
 *   1. Ask for the competency. One tag per win, and it is what turns the log into
 *      a packet you can filter — "here is ownership, and here are four dated
 *      things I own" — instead of a list of nice weeks.
 *   2. Nudge for the number. Dollars saved, latency cut, hours of manual work
 *      removed, users served. The placeholder carries that instruction because
 *      the habit is the point: small numbers now build the instinct you need for
 *      the bigger numbers later.
 *
 * It stays collapsed until asked for, opens with the cursor in the title, and
 * takes about ten seconds. The only thing it insists on is the competency —
 * a wrongly-filed win is worse than a missing one.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { COMPETENCY_SEED, type CompetencyId, type IsoDate } from '@/lib/career/types';

/* --------------------------------------------------------------------- shapes */

export type WinDraft = {
  title: string;
  happenedOn: IsoDate;
  competencyId: CompetencyId | '';
  impactNote: string;
  evidenceUrl: string;
};

/** What the API hands back. Kept structural so this file owns no DB import. */
export type SavedWin = {
  id: string;
  title: string;
  happenedOn: IsoDate;
  competencyId: string;
  impactNote: string;
  evidenceUrl: string | null;
};

export type WinFormProps = {
  /** Public tree passes false and this renders nothing — a form is a mutation. */
  editable: boolean;
  /** The server's today, so the default date cannot disagree with the dashboard. */
  today: IsoDate;
  competencies?: ReadonlyArray<{ id: string; name: string }>;
  /**
   * Pre-selected competency. The achievements screen can pass its weakest one:
   * the gap you are trying to close is the one you are most likely logging into.
   */
  defaultCompetencyId?: CompetencyId;
  /** Editing an existing win instead of logging a new one. */
  win?: SavedWin;
  /** 'card' draws its own panel; 'bare' drops inside someone else's. */
  variant?: 'card' | 'bare';
  /** Skip the collapsed trigger — the weekly review has already asked. */
  startOpen?: boolean;
  /** Replaces the collapsed trigger's line of copy. */
  prompt?: string;
  onSaved?: (win: SavedWin) => void;
  onCancel?: () => void;
  className?: string;
};

/* --------------------------------------------------------------------- styles
 *
 * Every colour is a theme token, and every control is a 44px target on a phone
 * before it relaxes to 40px at `sm`. Logging a win is the thing you do standing up
 * after the meeting where it happened, so this form has to be usable one-handed.
 *
 * The error line does not use a red *text* colour: `overdue` is reserved for dated
 * things that have genuinely passed, and at 12px it would fall under 4.5:1 on the
 * riso paper anyway. A failure shows as an overdue-coloured rule beside ink text,
 * which reads as an error in all six themes and passes contrast in all of them. */

const FIELD =
  'w-full box-border rounded-md border border-rule bg-surface px-3 text-[14px] text-ink ' +
  'outline-none transition-colors placeholder:text-ink-faint focus:border-signal ' +
  'disabled:bg-surface-2 disabled:text-ink-faint';

/** Input and button height: a real touch target first, a desk control second. */
const CONTROL = 'h-11 sm:h-10';

const PRIMARY =
  `${CONTROL} shrink-0 rounded-md bg-signal px-4 text-[13.5px] font-medium text-ink-on-signal ` +
  'transition-colors hover:bg-signal-hover disabled:cursor-not-allowed disabled:opacity-40';

const QUIET =
  `${CONTROL} inline-flex shrink-0 items-center rounded-md border border-rule bg-surface px-3.5 ` +
  'text-[13.5px] text-ink transition-colors hover:border-rule-strong disabled:opacity-40';

const LINK_BUTTON =
  'inline-flex min-h-[44px] items-center px-1 text-[13px] text-ink-muted underline-offset-4 ' +
  'transition-colors hover:text-ink hover:underline disabled:opacity-40 sm:min-h-[40px]';

/* ------------------------------------------------------------------- helpers */

function emptyDraft(today: IsoDate, competencyId: CompetencyId | ''): WinDraft {
  return { title: '', happenedOn: today, competencyId, impactNote: '', evidenceUrl: '' };
}

function draftOf(win: SavedWin): WinDraft {
  return {
    title: win.title,
    happenedOn: win.happenedOn,
    competencyId: win.competencyId as CompetencyId,
    impactNote: win.impactNote ?? '',
    evidenceUrl: win.evidenceUrl ?? '',
  };
}

/** True when there is enough here to save. Deliberately only two fields. */
export function canSaveWin(draft: WinDraft): boolean {
  return draft.title.trim().length > 0 && draft.competencyId !== '';
}

/* ----------------------------------------------------------------- component */

export default function WinForm({
  editable,
  today,
  competencies = COMPETENCY_SEED,
  defaultCompetencyId,
  win,
  variant = 'card',
  startOpen = false,
  prompt,
  onSaved,
  onCancel,
  className,
}: WinFormProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const uid = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  const editing = Boolean(win);
  const [open, setOpen] = useState(startOpen || editing);
  const [draft, setDraft] = useState<WinDraft>(() =>
    win ? draftOf(win) : emptyDraft(today, defaultCompetencyId ?? ''),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flourish, setFlourish] = useState(false);

  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!flourish) return;
    const timer = window.setTimeout(() => setFlourish(false), 1600);
    return () => window.clearTimeout(timer);
  }, [flourish]);

  const set = useCallback(<K extends keyof WinDraft>(key: K, value: WinDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setDraft(win ? draftOf(win) : emptyDraft(today, defaultCompetencyId ?? ''));
    onCancel?.();
  }, [defaultCompetencyId, onCancel, today, win]);

  const submit = useCallback(async () => {
    if (busy || !canSaveWin(draft)) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        win ? `/api/career/wins/${win.id}` : '/api/career/wins',
        {
          method: win ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: draft.title.trim(),
            happenedOn: draft.happenedOn,
            competencyId: draft.competencyId,
            impactNote: draft.impactNote.trim(),
            evidenceUrl: draft.evidenceUrl.trim() || null,
            today,
          }),
        },
      );

      const payload: unknown = await response.json().catch(() => null);
      const body = (payload ?? {}) as { ok?: boolean; win?: SavedWin; message?: string };

      if (!response.ok || !body.ok) {
        setError(
          response.status === 401
            ? 'That needs the admin code. Open /career/admin and unlock first.'
            : (body.message ?? 'That did not save. Nothing was changed.'),
        );
        return;
      }

      setFlourish(true);
      if (body.win) onSaved?.(body.win);

      if (editing) {
        setOpen(false);
      } else {
        // Cleared but left open when the caller asked for it open: the weekly
        // review usually shakes out two or three of these in a row.
        setDraft(emptyDraft(today, defaultCompetencyId ?? ''));
        if (!startOpen) setOpen(false);
        else titleRef.current?.focus();
      }

      router.refresh();
    } catch {
      setError('That did not reach the server. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }, [busy, defaultCompetencyId, draft, editing, onSaved, router, startOpen, today, win]);

  // The public tree renders this with editable={false}: the screens are the same
  // components, and the difference is a prop, never a fork.
  if (!editable) return null;

  const ready = canSaveWin(draft);

  // A form is an object you act on, so the card variant does earn a surface. The
  // bare variant drops into whatever is already holding it — the weekly review —
  // and adds no chrome of its own.
  const shell =
    variant === 'card'
      ? `box-border rounded-xl border border-rule bg-surface px-4 py-4 shadow-panel sm:px-6 sm:py-5 ${className ?? ''}`
      : `${className ?? ''}`;

  if (!open) {
    return (
      <section className={shell}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="type-display text-[16px] text-ink">Log a win</span>
            <span className="max-w-[56ch] text-[12.5px] leading-[1.45] text-ink-muted">
              {prompt ??
                'Something you did that no goal asked for — an incident run, a call that stuck, someone you got promoted.'}
            </span>
          </div>
          <button type="button" onClick={() => setOpen(true)} className={QUIET}>
            Log a win
          </button>
        </div>
      </section>
    );
  }

  return (
    <motion.section
      className={shell}
      initial={reduced ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
        className="flex flex-col gap-3"
        aria-label={editing ? 'Edit win' : 'Log a win'}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="type-display text-[16px] text-ink">
            {editing ? 'Edit this win' : (prompt ?? 'What did you do that no goal asked for?')}
          </span>
          <AnimatePresence>
            {flourish ? (
              // The flourish rewards the thing you just did and is then over. The
              // signal is on the square rather than on the word: the accent is a
              // 3:1 colour in riso, which is fine for a mark and not for 12px type.
              // In riso the word separates into the two inks for a beat; in the
              // other five themes `riso-register` does nothing at all.
              <motion.span
                initial={reduced ? false : { opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-ink"
              >
                <span className="h-[7px] w-[7px] rounded-[1px] bg-signal" aria-hidden />
                <span className="riso-register">Logged.</span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${uid}-title`} className="sr-only">
              What happened
            </label>
            <input
              ref={titleRef}
              id={`${uid}-title`}
              type="text"
              value={draft.title}
              onChange={(event) => set('title', event.target.value)}
              disabled={busy}
              maxLength={300}
              autoComplete="off"
              placeholder="Ran the payments outage to mitigation in 40 minutes"
              className={`${CONTROL} ${FIELD}`}
            />
          </div>
          <div className="w-full sm:w-[160px] sm:shrink-0">
            <label htmlFor={`${uid}-date`} className="sr-only">
              When it happened
            </label>
            <input
              id={`${uid}-date`}
              type="date"
              value={draft.happenedOn}
              onChange={(event) => set('happenedOn', event.target.value)}
              disabled={busy}
              className={`${CONTROL} ${FIELD}`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="w-full sm:w-[236px] sm:shrink-0">
            <label htmlFor={`${uid}-competency`} className="sr-only">
              Competency
            </label>
            <select
              id={`${uid}-competency`}
              value={draft.competencyId}
              onChange={(event) => set('competencyId', event.target.value as CompetencyId)}
              disabled={busy}
              className={`${CONTROL} ${FIELD} ${draft.competencyId ? 'text-ink' : 'text-ink-faint'}`}
            >
              <option value="">Which competency?</option>
              {competencies.map((competency) => (
                <option key={competency.id} value={competency.id}>
                  {competency.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${uid}-evidence`} className="sr-only">
              Evidence link
            </label>
            <input
              id={`${uid}-evidence`}
              type="text"
              inputMode="url"
              value={draft.evidenceUrl}
              onChange={(event) => set('evidenceUrl', event.target.value)}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              placeholder="Link to the evidence — incident doc, PR, thread (optional)"
              className={`${CONTROL} ${FIELD}`}
            />
          </div>
        </div>

        {/* The nudge. This placeholder is the habit the spec is trying to build:
            a win without a number is a story, and a win with one is evidence. */}
        <div>
          <label htmlFor={`${uid}-impact`} className="sr-only">
            Impact, with the number
          </label>
          <textarea
            id={`${uid}-impact`}
            rows={2}
            value={draft.impactNote}
            onChange={(event) => set('impactNote', event.target.value)}
            disabled={busy}
            maxLength={2000}
            placeholder="The number — $ saved, ms of latency cut, hours of manual work removed, users served"
            aria-describedby={`${uid}-hint`}
            className={`${FIELD} resize-none py-2.5 leading-[1.45]`}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <span
            id={`${uid}-hint`}
            className="min-w-0 text-[12px] leading-[1.45]"
            aria-live="polite"
          >
            {error ? (
              <span className="flex items-stretch gap-2 text-ink">
                <span className="w-[2px] shrink-0 rounded-[1px] bg-overdue" aria-hidden />
                {error}
              </span>
            ) : !draft.competencyId ? (
              <span className="text-ink-faint">
                One competency per win. It is the tag that makes the log filterable.
              </span>
            ) : draft.impactNote.trim() ? null : (
              <span className="text-ink-faint">
                Write the number if there is one. Small numbers now build the instinct for the
                bigger ones later.
              </span>
            )}
          </span>

          <span className="flex shrink-0 items-center justify-end gap-3">
            {/* A form the host opened has nothing to cancel back to, and the weekly
                review already carries its own "Not now" — two of them side by side
                is a choice nobody was asking to make. */}
            {startOpen && !editing ? null : (
              <button type="button" onClick={close} disabled={busy} className={LINK_BUTTON}>
                {editing ? 'Cancel' : 'Not now'}
              </button>
            )}
            <button type="submit" disabled={!ready || busy} className={PRIMARY}>
              {busy ? 'Saving' : editing ? 'Save win' : 'Log it'}
            </button>
          </span>
        </div>
      </form>
    </motion.section>
  );
}
