'use client';

/**
 * Evidence capture — the one deliberate piece of friction in the whole app.
 *
 * It opens when a milestone is about to be marked reached, and it takes a link, a
 * note, or both. It cannot be submitted empty, because a milestone with no evidence
 * cannot be done: that is the database CHECK, and more importantly it is the reason
 * the achievement log is worth anything in a promotion conversation.
 *
 * But it has to read as the reward for finishing rather than a tax on it, and the
 * tone is carried by three decisions rather than by cheerful copy:
 *
 *   1. **The form is the shape of the record.** It is drawn as the same inset
 *      surface, with the same two labelled fields, that the saved evidence will
 *      occupy once it is written. You are not filling in a form about the thing —
 *      you are writing the entry, and then it stays there.
 *   2. **Either field alone is enough.** Nothing is "required" individually, there
 *      is no format to get right, and a link that is not a link is kept as prose
 *      rather than rejected.
 *   3. **Nothing is coloured until it is done.** The milestone is still unfinished
 *      while this is open, so the panel is neutral; the signal colour arrives with
 *      the flourish at the moment of completion, and then it is over. No badge, no
 *      counter, nothing you can later fall behind on.
 *
 * **Shape follows the hand.** From `sm` up it is inline inside the expanded
 * milestone — a dialog there would read as an interruption, and this is meant to
 * read as a moment. On a phone inline is wrong: the fields would sit under the
 * on-screen keyboard and the submit button would be off-screen entirely, so
 * `EvidenceSheet` lifts the same form into a bottom sheet whose action row is
 * pinned above the keyboard. The sheet is sized off `visualViewport` rather than
 * `dvh` because iOS Safari does not shrink the layout viewport when the keyboard
 * comes up, and `position: fixed; bottom: 0` lands behind it.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import type { EvidenceValue } from './useGoalMutations';

export type { EvidenceValue };

/* ------------------------------------------------------------------ url shape */

/**
 * Best-effort normalisation of whatever got pasted in. `github.com/me/repo` gets
 * an https:// prefix; `PR #1094` is not a link and comes back null so the caller
 * can keep it out of `evidence_url` (it belongs in the note).
 *
 * Deliberately permissive — this is a personal ledger, not a form that has to
 * reject anything. The only hard rule is the protocol: a `javascript:` URL would
 * become a live link in Recently completed, so http/https only.
 */
export function normalizeEvidenceUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Rejects "PR #1094" and other bare prose that happens to parse.
  if (!url.hostname.includes('.')) return null;
  return url.toString();
}

/** True when there is enough here for the milestone to legitimately be done. */
export function hasEvidence(value: { evidenceUrl?: string | null; evidenceNote?: string | null }): boolean {
  return Boolean(normalizeEvidenceUrl(value.evidenceUrl) || (value.evidenceNote ?? '').trim());
}

/* -------------------------------------------------------------------- viewport */

/**
 * True below Tailwind's `sm`. Starts false so the server and the first client
 * paint agree; the sheet only ever appears after a click, by which time this has
 * settled.
 */
function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return compact;
}

/**
 * The visual viewport in layout coordinates, so a fixed overlay can be pinned to
 * the part of the screen the keyboard is not covering. Null until measured, and
 * null forever in a browser without `visualViewport`, where the overlay falls back
 * to `inset-0` and behaves as it always did.
 */
function useVisualViewport(active: boolean): { top: number; height: number } | null {
  const [rect, setRect] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => setRect({ top: viewport.offsetTop, height: viewport.height });
    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, [active]);

  return rect;
}

/** Stops the page behind the sheet from scrolling under it. */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/* --------------------------------------------------------------------- styles */

const fieldBase =
  'w-full rounded-[3px] border border-rule bg-surface px-3 text-ink outline-none transition-colors ' +
  'placeholder:text-ink-faint focus:border-signal disabled:bg-surface-2 disabled:text-ink-faint';

/* 44px and 16px on touch, both load-bearing: iOS Safari zooms the page when it
   focuses a field under 16px, and a 34px control is a miss on a moving train. */
const inputClass = `${fieldBase} h-11 text-[16px] sm:h-9 sm:text-[13.5px]`;
const areaClass = `${fieldBase} resize-none py-2.5 text-[16px] leading-[1.5] sm:text-[13.5px]`;

const primaryClass =
  'inline-flex h-11 shrink-0 items-center justify-center rounded-[3px] bg-signal px-5 text-[14px] ' +
  'font-medium text-ink-on-signal transition-colors hover:bg-signal-hover ' +
  'disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:text-[13px]';

const quietClass =
  'inline-flex h-11 shrink-0 items-center justify-center rounded-[3px] px-3 text-[13px] text-ink-muted ' +
  'transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9';

/* ---------------------------------------------------------------- field group */

function LabelledField({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="type-condensed text-[11.5px] text-ink-faint">
        {label}
      </label>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------- shared */

export type EvidenceCaptureProps = {
  /** Shown in the lead so it is obvious which checkpoint this is for. */
  milestoneTitle?: string;
  initial?: Partial<EvidenceValue>;
  /** 'capture' is the moment of finishing; 'edit' is amending it later. */
  mode?: 'capture' | 'edit';
  busy?: boolean;
  /** A server-side failure, surfaced here rather than only in the toast. */
  error?: string | null;
  submitLabel?: string;
  onSubmit: (value: EvidenceValue) => void | Promise<unknown>;
  /** Omit to render without a way out — the caller then owns dismissal. */
  onCancel?: () => void;
  autoFocus?: boolean;
};

/** Everything both layouts share: the two fields, the rule, and the submit. */
function useEvidenceForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: Pick<EvidenceCaptureProps, 'initial' | 'onSubmit' | 'onCancel'> & { busy: boolean }) {
  const [url, setUrl] = useState(initial?.evidenceUrl ?? '');
  const [note, setNote] = useState(initial?.evidenceNote ?? '');

  const normalized = normalizeEvidenceUrl(url);
  const trimmedNote = note.trim();
  const ready = Boolean(normalized || trimmedNote);
  // Typed something into the link box that is not a link. Worth a quiet nudge,
  // never a blocked submit — the note alone is perfectly good evidence.
  const linkLooksWrong = url.trim().length > 0 && normalized === null;

  const submit = useCallback(() => {
    if (!ready || busy) return;
    void onSubmit({
      evidenceUrl: normalized,
      // A non-URL typed into the link box is not thrown away — it is prose, so it
      // joins the note rather than vanishing when the panel closes.
      evidenceNote:
        linkLooksWrong && url.trim()
          ? [trimmedNote, url.trim()].filter(Boolean).join('\n')
          : trimmedNote || null,
    });
  }, [busy, linkLooksWrong, normalized, onSubmit, ready, trimmedNote, url]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape' && onCancel) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submit();
      }
    },
    [onCancel, submit],
  );

  return { url, setUrl, note, setNote, ready, linkLooksWrong, submit, onKeyDown };
}

function leadFor(mode: 'capture' | 'edit'): string {
  return mode === 'edit'
    ? 'What this one is evidenced by. A link, a note, or both.'
    : 'You reached it. What shows that you did?';
}

/**
 * The hint line under the fields. It states the rule without scolding: the resting
 * message is what the form accepts, not what you have failed to provide.
 */
function Hint({
  id,
  error,
  linkLooksWrong,
  ready,
}: {
  id: string;
  error: string | null;
  linkLooksWrong: boolean;
  ready: boolean;
}) {
  return (
    <p id={id} className="m-0 text-[12px] leading-[1.45]" aria-live="polite">
      {error ? (
        /* `overdue` is the palette's only red. A failed write is the one thing on
           this screen that is genuinely wrong — it is not an unfinished item being
           coloured, which is the rule the token exists to protect. */
        <span className="text-overdue">{error}</span>
      ) : linkLooksWrong ? (
        <span className="text-ink-muted">Not a link, so it will be kept with the note.</span>
      ) : ready ? (
        <span className="text-ink-faint">Saved with the milestone, and dated today.</span>
      ) : (
        <span className="text-ink-faint">A link or a note. Either one on its own is enough.</span>
      )}
    </p>
  );
}

/* ------------------------------------------------------------ inline (sm and up) */

/**
 * The inline form. Rendered directly inside the expanded milestone, on the same
 * inset surface the saved evidence will use.
 */
export default function EvidenceCapture({
  milestoneTitle,
  initial,
  mode = 'capture',
  busy = false,
  error = null,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = true,
}: EvidenceCaptureProps) {
  const reduced = useReducedMotion();
  const uid = useId();
  const urlRef = useRef<HTMLInputElement>(null);
  const form = useEvidenceForm({ initial, busy, onSubmit, onCancel });

  useEffect(() => {
    if (autoFocus) urlRef.current?.focus();
  }, [autoFocus]);

  return (
    <motion.form
      initial={reduced ? false : { opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}
      onSubmit={(event) => {
        event.preventDefault();
        form.submit();
      }}
      onKeyDown={form.onKeyDown}
      className="mt-3 flex flex-col gap-3 rounded-[3px] border border-rule bg-surface-2 px-3.5 py-3.5"
      aria-label={milestoneTitle ? `Evidence for ${milestoneTitle}` : 'Evidence'}
      aria-describedby={`${uid}-hint`}
    >
      <div className="flex flex-col gap-1">
        <p className="m-0 text-[12.5px] leading-[1.45] text-ink-muted">{leadFor(mode)}</p>
        {milestoneTitle && mode === 'capture' ? (
          <p className="type-display m-0 text-[15px] leading-[1.3] text-ink">{milestoneTitle}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <LabelledField htmlFor={`${uid}-url`} label="Link">
          <input
            ref={urlRef}
            id={`${uid}-url`}
            type="text"
            inputMode="url"
            value={form.url}
            onChange={(event) => form.setUrl(event.target.value)}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            placeholder="PR, doc, notebook, certificate"
            aria-describedby={`${uid}-hint`}
            className={inputClass}
          />
        </LabelledField>

        <LabelledField htmlFor={`${uid}-note`} label="Note">
          <textarea
            id={`${uid}-note`}
            rows={2}
            value={form.note}
            onChange={(event) => form.setNote(event.target.value)}
            disabled={busy}
            placeholder="What changed because of it, or what you learned"
            className={areaClass}
          />
        </LabelledField>
      </div>

      <div className="flex flex-col gap-3 border-t border-rule pt-3 sm:flex-row sm:items-center sm:justify-between">
        <Hint
          id={`${uid}-hint`}
          error={error}
          linkLooksWrong={form.linkLooksWrong}
          ready={form.ready}
        />
        <div className="flex items-center gap-1 sm:shrink-0">
          {onCancel ? (
            <button type="button" onClick={onCancel} disabled={busy} className={quietClass}>
              Not yet
            </button>
          ) : null}
          <button type="submit" disabled={!form.ready || busy} className={primaryClass}>
            {busy ? 'Saving' : (submitLabel ?? (mode === 'edit' ? 'Save evidence' : 'Mark reached'))}
          </button>
        </div>
      </div>
    </motion.form>
  );
}

/* --------------------------------------------------------------- sheet (phone) */

function SheetForm({
  milestoneTitle,
  initial,
  mode = 'capture',
  busy = false,
  error = null,
  submitLabel,
  onSubmit,
  onCancel,
}: EvidenceCaptureProps) {
  const reduced = useReducedMotion();
  const uid = useId();
  const panelRef = useRef<HTMLFormElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const form = useEvidenceForm({ initial, busy, onSubmit, onCancel });
  const viewport = useVisualViewport(true);
  useScrollLock(true);

  useEffect(() => {
    urlRef.current?.focus();
  }, []);

  // A modal has to keep the tab ring inside it; without this, tabbing past the
  // submit lands on the page behind the sheet, which on a phone is invisible.
  const trapTab = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  /* Portalled, and into `.ledger` rather than into <body>.
     Into a portal because the sheet is a fixed overlay inside the milestone's
     expand/collapse animation, and a transformed ancestor turns `position: fixed`
     into `position: absolute` inside a clipped box. Into `.ledger` because the
     type helpers and the riso rules are scoped to that class, and the portalled
     sheet has to stay in the same family as the screen it came from. */
  const host = typeof document === 'undefined' ? null : document.querySelector('.ledger') ?? document.body;
  if (!host) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      /* A neutral wash rather than a token: `ink` inverts between themes and would
         lay a white veil over carbon. A dark rgba means the same in all six. */
      className="fixed inset-x-0 z-50 flex items-end justify-center bg-[rgba(10,11,14,0.45)] backdrop-blur-[2px]"
      style={
        viewport
          ? { top: viewport.top, height: viewport.height }
          : { top: 0, bottom: 0 }
      }
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && onCancel) onCancel();
      }}
    >
      <motion.form
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={milestoneTitle ? `Evidence for ${milestoneTitle}` : 'Evidence'}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
        onSubmit={(event) => {
          event.preventDefault();
          form.submit();
        }}
        onKeyDown={(event) => {
          trapTab(event);
          form.onKeyDown(event);
        }}
        className="flex max-h-full w-full flex-col overflow-hidden rounded-t-2xl border-t border-rule bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.26)]"
      >
        <div className="shrink-0 border-b border-rule px-4 pb-3 pt-4">
          <p className="m-0 text-[12.5px] leading-[1.45] text-ink-muted">{leadFor(mode)}</p>
          {milestoneTitle && mode === 'capture' ? (
            <p className="type-display m-0 mt-1 text-[17px] leading-[1.25] text-ink">
              {milestoneTitle}
            </p>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto bg-surface-2 px-4 py-4">
          <LabelledField htmlFor={`${uid}-url`} label="Link">
            <input
              ref={urlRef}
              id={`${uid}-url`}
              type="text"
              inputMode="url"
              value={form.url}
              onChange={(event) => form.setUrl(event.target.value)}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              placeholder="PR, doc, notebook, certificate"
              aria-describedby={`${uid}-hint`}
              className={inputClass}
            />
          </LabelledField>

          <LabelledField htmlFor={`${uid}-note`} label="Note">
            <textarea
              id={`${uid}-note`}
              rows={3}
              value={form.note}
              onChange={(event) => form.setNote(event.target.value)}
              disabled={busy}
              placeholder="What changed because of it, or what you learned"
              className={areaClass}
            />
          </LabelledField>

          <Hint
            id={`${uid}-hint`}
            error={error}
            linkLooksWrong={form.linkLooksWrong}
            ready={form.ready}
          />
        </div>

        {/* Pinned, and outside the scroll area. The overlay is sized to the visual
            viewport, so this row sits directly above the keyboard rather than
            behind it. */}
        <div
          className="flex shrink-0 items-center gap-2 border-t border-rule bg-surface px-4 py-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {onCancel ? (
            <button type="button" onClick={onCancel} disabled={busy} className={quietClass}>
              Not yet
            </button>
          ) : null}
          <span className="flex-grow" />
          <button type="submit" disabled={!form.ready || busy} className={primaryClass}>
            {busy ? 'Saving' : (submitLabel ?? (mode === 'edit' ? 'Save evidence' : 'Mark reached'))}
          </button>
        </div>
      </motion.form>
    </motion.div>,
    host,
  );
}

/**
 * Evidence capture in whichever shape the screen can carry: inline from `sm` up, a
 * keyboard-aware bottom sheet below it. Callers render this and pass `open`; the
 * form state is mounted and unmounted with it, so an abandoned capture does not
 * quietly keep half a note.
 */
export function EvidenceSheet({ open, ...props }: EvidenceCaptureProps & { open: boolean }) {
  const compact = useCompactViewport();

  if (compact) {
    return (
      <AnimatePresence>{open ? <SheetForm key="sheet" {...props} /> : null}</AnimatePresence>
    );
  }
  return open ? <EvidenceCapture {...props} /> : null;
}

/* ------------------------------------------------------------------ flourish */

/**
 * The brief flourish a milestone gets when it is reached: one signal-coloured
 * sweep across the entry and a barely-there lift, then it is over. In riso the
 * two inks separate for a beat and register, which is the same idea in that
 * theme's own language.
 *
 * This is the whole of the reward, on purpose. It celebrates the thing you just
 * did and leaves nothing behind — no badge, no counter, no balance you can later
 * fall behind on. Drive it from `celebrating === milestone.id`.
 */
export function MilestoneFlourish({
  active,
  children,
  className,
}: {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={`relative ${active ? 'riso-register ' : ''}${className ?? ''}`}
      animate={active && !reduced ? { scale: [1, 1.012, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
    >
      {children}
      <AnimatePresence>
        {active && !reduced ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.span
              className="absolute inset-y-0 w-1/2 opacity-[0.16]"
              style={{
                background: 'linear-gradient(90deg, transparent, var(--signal), transparent)',
              }}
              initial={{ x: '-110%' }}
              animate={{ x: '210%' }}
              transition={{ duration: 0.85, ease: [0.3, 0, 0.2, 1] }}
            />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
