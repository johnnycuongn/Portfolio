'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import MasterTable, { type CellSlot, type TableEditors } from './Table';
import {
  EFFORTS,
  ITEM_STATUSES,
  STATUS_LABEL,
  type IsoDate,
  type ItemStatus,
  type MasterTableData,
  type RowType,
  type TableRow,
} from './presets';
import { useInlineEdit, type CareerEntity, type InlineEditController } from './useInlineEdit';

/**
 * One cell of the master table, in both of its moods.
 *
 * The same component renders the public read-only table and the admin one — the
 * `editable` prop is the only difference, which is the rule the whole career
 * dashboard is built on: never two copies of a screen that can drift apart.
 *
 * Read-only, it is a plain span and looks like text in a table.
 *
 * Editable, it is an *instrument* field rather than a button: the value keeps a
 * dotted rule under it at rest, the way a figure entered on a ruled form does.
 * That rule is the whole affordance, and it is deliberately always present. A
 * cell that only grows a border on hover cannot be found on a phone, where there
 * is no hover — and the Sunday-evening tidying pass is exactly the thing you do
 * from the sofa. Quiet enough to disappear down a column of 200 rows, present
 * enough to answer "can I change this?" without moving the pointer.
 *
 * Committing happens in place — no dialog, no row expansion, no save button, and
 * for a select, no confirmation at all: one change is one write, and the undo
 * toast at the bottom of the screen is what makes that safe.
 *
 * ## Colour
 *
 * The spec's rule is that colour marks what you have DONE, never what you owe.
 * The stricter rule this file adds: **the accent never carries small text.**
 * Riso's fluorescent pink reaches only ~3:1 against its paper, so `--signal` as
 * a 12px text colour is unreadable in one of the six themes and there is no
 * per-theme escape hatch available from here. So "done" is marked by a
 * `signal-soft` tint behind full-contrast ink (`marked`), and the save flourish
 * is a wash of the same tint — colour on a surface, text always in `--ink`.
 */

/* ------------------------------------------------------------------- tokens */

/**
 * Legacy palette map, kept because sibling components import it. Every entry now
 * resolves to a theme custom property, so a stale `style={{ color: CELL.ink }}`
 * follows the theme instead of pinning a light-mode hex.
 *
 * Prefer the Tailwind utilities (`text-ink`, `border-rule`, …) in new code.
 */
export const CELL = {
  ink: 'var(--ink)',
  muted: 'var(--ink-muted)',
  dim: 'var(--ink-muted)',
  faint: 'var(--ink-faint)',
  // Not `--ink-faint`: the empty mark is text, and `--ink-faint` tops out at
  // 3.7:1 on every theme. An em dash is one glyph wide, so full legibility costs
  // it no visual weight anyway.
  empty: 'var(--ink-muted)',
  hairline: 'var(--rule-strong)',
  paper: 'var(--surface)',
  page: 'var(--ground)',
  accent: 'var(--signal)',
  link: 'var(--signal)',
  done: 'var(--ink)',
} as const;

/**
 * Status text colours. Two values only, because status is a two-level
 * distinction when you are scanning: live work reads at full strength, settled
 * or not-yet-started work recedes. Nothing here is the accent — see the note on
 * contrast above — and nothing is red, because nothing in this column is
 * overdue; a missed *date* is the only thing that earns `--overdue`.
 */
export const STATUS_TONE: Record<string, string> = {
  done: 'var(--ink)',
  doing: 'var(--ink)',
  active: 'var(--ink)',
  todo: 'var(--ink-muted)',
  paused: 'var(--ink-muted)',
  backlog: 'var(--ink-muted)',
  dropped: 'var(--ink-muted)',
};

export function statusTone(status: string | null | undefined): string {
  return (status && STATUS_TONE[status]) || 'var(--ink-muted)';
}

/**
 * How a completed thing is marked: a tint behind the value, never coloured text.
 * Exported so the table can apply the same mark to cells it renders itself.
 */
export const DONE_TINT = 'bg-signal-soft';

/**
 * Hit area. Dense on a mouse — this is a 200-row spreadsheet and a 44px row
 * would halve how much of it you can see — and 44px the moment the pointer is
 * coarse, where dense is unusable. One media query, not a compromise between
 * the two.
 */
const TAP = 'min-h-[30px] [@media(pointer:coarse)]:min-h-[44px]';
const TAP_CONTROL =
  'min-h-[34px] min-w-[34px] [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]';

/**
 * The open-for-editing state, and the reason it is not just the focus ring.
 *
 * A 1px `--signal` hairline on `--surface` is plenty on paper-white, and nearly
 * nothing on carbon, where `--surface` (#16181d) sits a hair off `--ground`
 * (#0f1013) and a single blue line at 13px reads as a rendering artefact. So the
 * live field gets three things at once, all of them token-driven so they hold in
 * every theme: a lift to `surface-2`, a signal rule doubled by an inset ring (2px
 * of edge with no 1px layout shift), and the panel shadow. The `:focus-visible`
 * outline theme.css draws is left alone on top of it — this is the state of the
 * CELL, which stays legible even when focus has gone somewhere else.
 */
const EDITING =
  'border-signal bg-surface-2 ring-1 ring-inset ring-signal shadow-panel';

/* -------------------------------------------------------------------- types */

export type CellKind = 'text' | 'longtext' | 'select' | 'date' | 'url' | 'number';

export type CellOption = { value: string; label: string };

export type EditableCellProps = {
  /** Public tree passes false, admin tree passes true. Never fork the component. */
  editable: boolean;
  kind?: CellKind;
  /** The stored value. `null` renders as the empty mark. */
  value: string | null;
  /** Committed value, or null when the field was emptied. May be async. */
  onCommit: (next: string | null) => void | Promise<unknown>;
  /** Accessible name — "Status", "Competency", "Evidence link". Required. */
  label: string;
  options?: readonly CellOption[];
  /** Custom read-mode rendering: an evidence link, a formatted date, a chip. */
  display?: ReactNode;
  /** Shown in place of nothing. The artboard uses an em dash. */
  emptyLabel?: string;
  placeholder?: string;
  /** Select only: offer a "clear this" entry. */
  allowEmpty?: boolean;
  /** From the controller: `isPending(scope)` / `errorFor(scope)?.message`. */
  pending?: boolean;
  error?: string | null;
  onDismissError?: () => void;
  align?: 'left' | 'right' | 'center';
  /**
   * Condensed width axis, for the narrow numeric columns. Named `mono` for the
   * call sites that predate the type system: there is no monospace face any
   * more, and none is needed — tabular figures are on globally.
   */
  mono?: boolean;
  /** Overrides the text colour. Pass a token (`var(--ink-muted)`), not a hex. */
  tone?: string;
  /** Marks this cell as a completed thing: a signal tint behind ink text. */
  marked?: boolean;
  className?: string;
  /** Applied to the cell wrapper, for the fixed column widths of the table. */
  style?: CSSProperties;
  title?: string;
  /**
   * Extra classes for the open input only.
   *
   * The narrow columns are the reason this exists: Target is 86px wide, and a
   * native date input rendered at 68px clips `dd/mm/yyyy` into something you
   * cannot read or type into. A right-aligned cell can give its input a
   * `min-w-` and let it grow leftwards over the column before it, which is free
   * — that column is only ever a figure, and only while you are editing.
   */
  editorClassName?: string;
};

/* ------------------------------------------------------------------ helpers */

const TEXT_ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

const FLEX_ALIGN = {
  left: 'justify-start',
  right: 'justify-end',
  center: 'justify-center',
} as const;

const INPUT_TYPE: Partial<Record<CellKind, string>> = {
  date: 'date',
  url: 'url',
  number: 'number',
  text: 'text',
};

function normalise(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/* --------------------------------------------------------------------- cell */

export function EditableCell({
  editable,
  kind = 'text',
  value,
  onCommit,
  label,
  options,
  display,
  emptyLabel = '—',
  placeholder,
  allowEmpty = false,
  pending = false,
  error = null,
  onDismissError,
  align = 'left',
  mono = false,
  tone,
  marked = false,
  className = '',
  style,
  title,
  editorClassName = '',
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [flash, setFlash] = useState(0);
  const wasPending = useRef(false);
  const abandoned = useRef(false);
  const errorId = useId();

  const isEmpty = value === null || value === '';
  const colour = tone ?? (isEmpty ? CELL.empty : CELL.ink);
  const width = mono ? 'type-condensed' : '';

  /**
   * The flourish: a half-second wash of the accent tint when a save lands. This
   * is the whole of the celebration — it rewards the thing you just did and is
   * then over. No counter goes up, nothing is owed afterwards, and it never
   * accumulates into a streak.
   */
  useEffect(() => {
    if (wasPending.current && !pending && !error) setFlash((n) => n + 1);
    wasPending.current = pending;
  }, [error, pending]);

  const commit = useCallback(
    (raw: string) => {
      setEditing(false);
      // Escape unmounts the input, and removing a focused node fires focusout in
      // some browsers — without this guard, abandoning an edit would save it.
      if (abandoned.current) {
        abandoned.current = false;
        return;
      }
      const next = normalise(raw);
      if (next === (isEmpty ? null : value)) return;
      void onCommit(next);
    },
    [isEmpty, onCommit, value],
  );

  const abandon = useCallback(() => {
    abandoned.current = true;
    setEditing(false);
  }, []);

  const beginEdit = useCallback(() => {
    abandoned.current = false;
    setDraft(value ?? '');
    setEditing(true);
  }, [value]);

  const shellProps = {
    align,
    className,
    style,
    error,
    errorId,
    onDismissError,
    pending,
    flash,
    marked,
  };

  /* ------------------------------------------------------------ read-only */

  const body = display ?? (isEmpty ? emptyLabel : value);

  if (!editable) {
    return (
      <span
        className={`block truncate ${TEXT_ALIGN[align]} ${width} ${className}`}
        style={{ color: colour, ...style }}
        title={title}
      >
        {body}
      </span>
    );
  }

  /* --------------------------------------------------------------- select */

  if (kind === 'select') {
    // A native select, deliberately: on a phone it opens the platform's own
    // wheel, which is the best picker on the device and free. `appearance-none`
    // drops the OS chevron for a token-coloured one so the control follows the
    // theme instead of staying light grey on carbon.
    return (
      <Shell {...shellProps}>
        <select
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-busy={pending || undefined}
          value={value ?? ''}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value;
            if (next === (value ?? '')) return;
            void onCommit(next === '' ? null : next);
          }}
          // `border-rule-strong`, not `border-rule`: on carbon the weak rule
          // (#272a32 on #0f1013) is invisible until you hover, and there is no
          // hover on a phone — the box has to be findable by eye alone.
          className={`peer w-full cursor-pointer appearance-none rounded-[3px] border border-rule-strong bg-transparent py-1 pl-1.5 pr-5 text-[12.5px] transition-colors hover:border-ink-faint hover:bg-surface focus:border-signal disabled:cursor-wait ${TAP} ${width} ${TEXT_ALIGN[align]}`}
          style={{ color: tone ?? statusTone(value) }}
        >
          {/* Options are painted by the platform's popup, which follows the
              `color-scheme` theme.css sets on `.ledger`; the classes below are
              honoured where the browser allows it and ignored where it does
              not, so carbon never ends up with dark text on a dark popup. */}
          {(allowEmpty || isEmpty) && (
            <option className="bg-surface text-ink" value="">
              {emptyLabel}
            </option>
          )}
          {options?.map((option) => (
            <option className="bg-surface text-ink" key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[7px] leading-none text-ink-faint transition-colors peer-hover:text-ink-muted peer-focus:text-signal"
        >
          ▼
        </span>
      </Shell>
    );
  }

  /* ----------------------------------------------------------- free text */

  if (editing) {
    // No `outline-none` anywhere in here: theme.css owns the focus ring, it is
    // the only thing that reads as "active" on carbon, and an input always
    // matches :focus-visible so it is always drawn.
    const shared = {
      autoFocus: true,
      'aria-label': label,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? errorId : undefined,
      placeholder,
      value: draft,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(event.target.value),
      onBlur: () => commit(draft),
      className: `w-full rounded-[3px] border px-1.5 py-1 text-[13px] text-ink placeholder:text-ink-muted ${EDITING} ${TAP} ${width} ${TEXT_ALIGN[align]} ${editorClassName}`,
    };

    if (kind === 'longtext') {
      return (
        <Shell {...shellProps}>
          <textarea
            {...shared}
            rows={3}
            onKeyDown={(event) => {
              // Enter is a newline here; Cmd/Ctrl+Enter saves, Escape abandons.
              if (event.key === 'Escape') {
                event.preventDefault();
                abandon();
              } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                commit(draft);
              }
            }}
          />
        </Shell>
      );
    }

    return (
      <Shell {...shellProps}>
        <input
          {...shared}
          type={INPUT_TYPE[kind] ?? 'text'}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(draft);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              abandon();
            }
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell {...shellProps}>
      <button
        type="button"
        aria-label={`${label}: ${isEmpty ? 'empty' : value}`}
        // No aria-invalid: it is not a supported attribute on the implicit
        // button role. The message is announced through aria-describedby.
        aria-describedby={error ? errorId : undefined}
        aria-busy={pending || undefined}
        disabled={pending}
        title={title}
        onClick={beginEdit}
        className={`group/cell flex w-full items-center rounded-[3px] border border-transparent px-1.5 py-1 text-[13px] transition-colors hover:border-rule-strong hover:bg-surface disabled:cursor-wait ${TAP} ${width} ${FLEX_ALIGN[align]}`}
        style={{ color: colour }}
      >
        {/*
          The ruled line under the value: the always-there affordance, present at
          rest so a phone can find it. Dotted, so it reads as the printed guide
          on a form rather than as a border, and it firms up to a solid rule on
          hover and to the signal colour when the cell takes keyboard focus.
        */}
        <span
          key={flash}
          className={`min-w-0 truncate border-b border-dotted border-rule-strong pb-px transition-colors group-hover/cell:border-solid group-hover/cell:border-ink-faint group-focus-visible/cell:border-solid group-focus-visible/cell:border-signal ${
            flash > 0 ? 'riso-register' : ''
          } ${TEXT_ALIGN[align]}`}
        >
          {body}
        </span>
      </button>
    </Shell>
  );
}

/* -------------------------------------------------------------------- shell */

/**
 * The bit every editable variant shares: the completion tint, the save flourish
 * and the error popover.
 *
 * Errors sit on the cell that caused them — a 422 saying a milestone needs
 * evidence is only useful next to the evidence field. The popover is a tinted
 * surface with ink text rather than red text on white, because `--overdue` as a
 * 12px text colour falls under 4.5:1 on riso's warm paper while ink on
 * `--overdue-soft` is comfortable in all six themes.
 */
function Shell({
  children,
  align,
  className,
  style,
  error,
  errorId,
  onDismissError,
  pending,
  flash,
  marked,
}: {
  children: ReactNode;
  align: 'left' | 'right' | 'center';
  className?: string;
  style?: CSSProperties;
  error: string | null;
  errorId: string;
  onDismissError?: () => void;
  pending: boolean;
  flash: number;
  marked: boolean;
}) {
  // motion writes transforms and opacity INLINE, which the global
  // prefers-reduced-motion override in theme.css cannot cancel — a CSS guard is
  // not enough here, the component has to branch.
  const still = useReducedMotion();

  return (
    <span
      // `z-30` only while a message is up, and it is load-bearing: the popover
      // hangs below the row, and the cells of the NEXT row are painted after
      // this one, so without a z-index on the cell itself they cover the
      // message — `isolate` scopes the popover's own z-20 to this span and
      // cannot lift the span past its siblings. Not permanent, because a
      // z-index on all 200 cells would also outrank the sticky header.
      className={`relative isolate flex min-w-0 items-center rounded-[3px] ${FLEX_ALIGN[align]} ${
        marked ? DONE_TINT : ''
      } ${pending ? 'opacity-60' : ''} ${error ? 'z-30' : ''} ${className ?? ''}`}
      style={style}
    >
      {/*
        The save flourish. Under reduced motion it is dropped rather than
        replayed instantly: a half-second fade IS the whole of this element, so
        a zero-duration version is a flicker, and the value in the cell having
        changed is confirmation enough.
      */}
      {flash > 0 && !still ? (
        <motion.span
          key={flash}
          aria-hidden
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 -z-10 rounded-[3px] bg-signal-soft"
        />
      ) : null}

      {children}

      <AnimatePresence>
        {error ? (
          <CellError id={errorId} message={error} onDismiss={onDismissError} />
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/**
 * The message a rejected write leaves behind, anchored under the control that
 * caused it. Its own component because the tick box is not an `EditableCell`
 * and still has to be able to say "this milestone needs evidence first" in the
 * same voice and the same place.
 *
 * Always rendered inside an `AnimatePresence` and a `relative` parent.
 */
export function CellError({
  id,
  message,
  onDismiss,
}: {
  id: string;
  message: string;
  onDismiss?: () => void;
}) {
  const still = useReducedMotion();

  return (
    <motion.span
      id={id}
      role="alert"
      // An error must never be withheld pending an animation, so under reduced
      // motion it is simply already in its final state.
      initial={still ? false : { opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={still ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: still ? 0 : 0.16 }}
      className="absolute left-0 top-full z-20 mt-1 flex w-max max-w-[240px] items-start gap-1.5 rounded-md border border-overdue bg-overdue-soft px-2.5 py-1.5 text-left text-[11.5px] leading-snug text-ink shadow-panel"
    >
      <span className="min-w-0">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss this message"
          className="-my-1.5 -mr-1.5 flex shrink-0 items-center justify-center self-stretch px-1.5 text-[13px] leading-none text-ink-muted transition-colors hover:text-ink"
        >
          ×
        </button>
      ) : null}
    </motion.span>
  );
}

/* ---------------------------------------------------------------- undo toast */

/**
 * The undo toast. It is the counterweight to "one click, no confirmation": the
 * reason nothing in this table asks you to confirm is that everything can be put
 * back, and pressing Undo here really does write the old values back — the steps
 * came from the server, which diffed the row it wrote against the row it read.
 *
 * On a phone it is a full-width bar clear of the home indicator, because this is
 * the only route back from a mis-tap and a toast hiding under the browser chrome
 * is the same as no undo at all.
 */
export function UndoToast({ controller }: { controller: InlineEditController }) {
  const { toast, runUndo, dismissToast } = controller;
  // Same reason as in Shell: motion's inline transform outruns the CSS override.
  const still = useReducedMotion();

  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          key={toast.key}
          initial={still ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={still ? { opacity: 1 } : { opacity: 0, y: 6 }}
          transition={{ duration: still ? 0 : 0.2, ease: 'easeOut' }}
          role="status"
          aria-live="polite"
          className="pointer-events-auto fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[calc(100vw-1.5rem)] max-w-[30rem] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-rule-strong bg-surface px-3 py-2 text-[13px] text-ink shadow-panel sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:w-auto sm:px-4"
        >
          <span className="min-w-0 flex-1 basis-40 truncate">{toast.message}</span>

          {toast.failed ? (
            <span className="rounded border border-overdue bg-overdue-soft px-1.5 py-0.5 text-[11.5px] text-ink">
              Undo did not go through
            </span>
          ) : null}

          <span className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void runUndo()}
              disabled={toast.running}
              className={`flex items-center justify-center rounded border border-rule-strong px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:cursor-wait disabled:opacity-50 ${TAP_CONTROL}`}
            >
              {toast.running ? 'Undoing' : 'Undo'}
            </button>

            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss"
              className={`flex items-center justify-center rounded text-[16px] leading-none text-ink-faint transition-colors hover:text-ink ${TAP_CONTROL}`}
            >
              ×
            </button>
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ==========================================================================
   The seam: the master table, wired to the API.
   ==========================================================================

   `Table.tsx` is presentational and stays that way. It exposes one hole per
   editable cell (`TableEditors`), and everything below fills those holes. The
   public tree imports `Table` directly and passes no `editors`, so not one line
   of this file is reachable from /career — the read-only table is read-only
   because the mutation code is never handed to it, not because a flag is off.

   Which cell edits what is decided by the row's own type, and the rule is that
   a cell is editable exactly when the row OWNS that field:

     - a task has no competency of its own; it inherits its goal's, and offering
       to change it here would silently rewrite every sibling row's competency.
     - a task has no target date and a milestone has no effort — those columns
       are structurally empty for that type, not merely unset.
     - a win is a thing that already happened. It has no status to move.

   Anything not owned falls back to `readOnly`, which is the same rendering the
   public table draws, so no cell ever becomes a lie about what it can do. */

/** The API collection each row type lives in. */
const ENTITY: Record<RowType, CareerEntity> = {
  goal: 'goals',
  milestone: 'milestones',
  task: 'tasks',
  win: 'wins',
};

const STATUS_OPTIONS: readonly CellOption[] = ITEM_STATUSES.map((status) => ({
  value: status,
  label: STATUS_LABEL[status],
}));

const EFFORT_OPTIONS: readonly CellOption[] = EFFORTS.map((effort) => ({
  value: effort,
  label: effort,
}));

/** Undo copy has to fit a phone-width toast beside the button, so titles clip. */
function shortTitle(title: string): string {
  return title.length > 30 ? `${title.slice(0, 29)}…` : title;
}

/**
 * Whether a typed evidence value is meant as a link rather than a note. Only
 * consulted when the cell was empty and so has no field to write back to — once
 * there is a value, you are editing the field it came from.
 */
function looksLikeUrl(value: string): boolean {
  const text = value.trim();
  if (/^https?:\/\//i.test(text)) return true;
  return !/\s/.test(text) && /^[\w-]+(\.[\w-]+)+(\/|\?|$)/.test(text);
}

type EvidenceField = 'note' | 'url' | null;

/**
 * Evidence is two columns behind one cell, and this keeps that honest: you edit
 * the field the value you can see came from, and clearing the cell clears only
 * that field. A milestone with both a note and a link shows the note as the
 * label and the link on the ↗ beside it — editing the label must not silently
 * throw the link away.
 */
function evidenceBody(
  type: RowType,
  field: EvidenceField,
  next: string | null,
): Record<string, unknown> {
  // A win's note column is `impactNote`; it is NOT NULL, and its route maps an
  // emptied value back to ''.
  const noteKey = type === 'win' ? 'impactNote' : 'evidenceNote';
  if (field === 'note') return { [noteKey]: next };
  if (field === 'url') return { evidenceUrl: next };
  return next && looksLikeUrl(next) ? { evidenceUrl: next } : { [noteKey]: next };
}

/* ------------------------------------------------------------------ the tick */

/**
 * One click completes a row. No dialog, no confirm, no second field — the undo
 * toast is what makes that safe, and it replays the server's own inverse PATCH,
 * so untick-then-undo restores the exact status and date the row had rather
 * than guessing at `todo`.
 *
 * It lives in the wide "Goal, milestone or task" column rather than the 100px Status
 * column, because a 44px tap target and a status dropdown cannot both fit in
 * 82px of usable width, and of the two it is the tick that has to be reachable
 * with a thumb.
 *
 * Unticking goes to `todo` rather than back to `doing`: a thing you just said
 * was not finished is a thing you have not necessarily restarted. Undo is
 * there, and it is exact.
 */
function TickBox({ controller, row }: { controller: InlineEditController; row: TableRow }) {
  const scope = `${row.id}:tick`;
  const errorId = useId();
  const error = controller.errorFor(scope);
  const pending = controller.isPending(scope);
  const done = row.status === 'done';

  return (
    // `z-30` while a message is up — see the note in Shell.
    <span className={`relative isolate flex shrink-0 items-center ${error ? 'z-30' : ''}`}>
      <button
        type="button"
        aria-pressed={done}
        aria-label={done ? `Reopen ${row.title}` : `Mark ${row.title} done`}
        aria-describedby={error ? errorId : undefined}
        aria-busy={pending || undefined}
        disabled={pending}
        onClick={() => {
          void controller.setStatus(ENTITY[row.type], row.id, done ? 'todo' : 'done', {
            scope,
            undoLabel: done
              ? `Reopened “${shortTitle(row.title)}”`
              : `Completed “${shortTitle(row.title)}”`,
          });
        }}
        className={`-ml-1 flex items-center justify-center rounded transition-colors disabled:cursor-wait disabled:opacity-60 ${TAP_CONTROL}`}
      >
        {/* Colour marks what is done and nothing else: an open box is a neutral
            rule, and only the filled one spends the signal. */}
        <span
          aria-hidden
          className={`flex h-[15px] w-[15px] items-center justify-center rounded-[3px] border text-[10px] leading-none transition-colors ${
            done
              ? 'border-signal bg-signal text-ink-on-signal'
              : 'border-rule-strong text-transparent hover:border-ink-faint hover:bg-surface-2'
          }`}
        >
          ✓
        </span>
      </button>

      <AnimatePresence>
        {error ? (
          <CellError
            id={errorId}
            message={error.message}
            onDismiss={() => controller.clearError(scope)}
          />
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/* --------------------------------------------------------------- the editors */

/**
 * Builds one slot per editable column. Plain functions, not components: `Table`
 * calls them to render a cell, so nothing here may use a hook — the hooks live
 * inside `EditableCell` and `TickBox`, which are real components.
 */
function buildEditors(
  controller: InlineEditController,
  competencyOptions: readonly CellOption[],
): TableEditors {
  /** Per-cell pending flag and error, keyed so one bad cell never greys a row. */
  const state = (row: TableRow, field: string) => {
    const scope = `${row.id}:${field}`;
    return {
      scope,
      editable: true,
      pending: controller.isPending(scope),
      error: controller.errorFor(scope)?.message ?? null,
      onDismissError: () => controller.clearError(scope),
    };
  };

  const status: CellSlot = ({ row, readOnly }) => {
    // A win has no status to move — it already happened.
    if (row.type === 'win') return readOnly;
    const { scope, ...cell } = state(row, 'status');

    return (
      <EditableCell
        {...cell}
        kind="select"
        label={`Status of ${row.title}`}
        value={row.status}
        options={STATUS_OPTIONS}
        mono
        marked={row.status === 'done'}
        onCommit={(next) => {
          if (!next) return;
          return controller.setStatus(ENTITY[row.type], row.id, next, {
            scope,
            undoLabel: `“${shortTitle(row.title)}” → ${
              STATUS_LABEL[next as ItemStatus] ?? next
            }`,
          });
        }}
      />
    );
  };

  const title: CellSlot = ({ row }) => {
    const { scope, ...cell } = state(row, 'title');

    return (
      <>
        {row.type === 'win' ? null : <TickBox controller={controller} row={row} />}
        <EditableCell
          {...cell}
          label="Title"
          value={row.title}
          className="min-w-0 flex-1"
          editorClassName="min-w-[180px]"
          tone={row.status === 'done' ? CELL.muted : CELL.ink}
          title={row.title}
          // An emptied title is not silently dropped: the route answers "A task
          // needs a title", which lands on this cell and says what to do.
          onCommit={(next) =>
            controller.patch(
              ENTITY[row.type],
              row.id,
              { title: next },
              { scope, undoLabel: `Renamed “${shortTitle(row.title)}”` },
            )
          }
        />
      </>
    );
  };

  const competency: CellSlot = ({ row, readOnly }) => {
    if (row.type === 'task') {
      // Inherited from the goal, deliberately. Changing it here would move every
      // other row of that goal too, which is not what this cell looks like it does.
      return (
        <span title="A task follows its goal’s competency. Change it on the goal.">
          {readOnly}
        </span>
      );
    }
    const { scope, ...cell } = state(row, 'competency');

    return (
      <EditableCell
        {...cell}
        kind="select"
        label={`Competency of ${row.title}`}
        value={row.competencyId}
        options={competencyOptions}
        mono
        tone={CELL.muted}
        onCommit={(next) => {
          if (!next) return;
          return controller.patch(
            ENTITY[row.type],
            row.id,
            { competencyId: next },
            { scope, undoLabel: `Competency on “${shortTitle(row.title)}”` },
          );
        }}
      />
    );
  };

  const evidence: CellSlot = ({ row, readOnly }) => {
    // A task carries no evidence of its own; its milestone does.
    if (row.type === 'task') return readOnly;
    const { scope, ...cell } = state(row, 'evidence');

    const note = row.evidenceNote?.trim() ?? '';
    const url = row.evidenceUrl?.trim() ?? '';
    const field: EvidenceField = note ? 'note' : url ? 'url' : null;

    return (
      <span className="flex min-w-0 items-center justify-end gap-1">
        <EditableCell
          {...cell}
          kind={field === 'url' ? 'url' : 'text'}
          label={`Evidence for ${row.title}`}
          value={note || url || null}
          align="right"
          mono
          className="min-w-0 flex-1"
          editorClassName="min-w-[168px]"
          placeholder="Link or note"
          title={note && url ? `${note} — ${url}` : note || url || undefined}
          onCommit={(next) =>
            controller.patch(ENTITY[row.type], row.id, evidenceBody(row.type, field, next), {
              scope,
              undoLabel: `Evidence on “${shortTitle(row.title)}”`,
            })
          }
        />
        {/* The link survives the cell becoming editable. An <a> cannot live
            inside the cell's <button>, so it stands beside it as its own
            control — which is also what makes it tappable. */}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open the evidence link for ${row.title}`}
            title={url}
            className={`flex shrink-0 items-center justify-center rounded text-[12px] leading-none text-ink-muted transition-colors hover:bg-surface hover:text-ink ${TAP_CONTROL}`}
          >
            <span aria-hidden>↗</span>
          </a>
        ) : null}
      </span>
    );
  };

  const effort: CellSlot = ({ row, readOnly }) => {
    // Effort is a property of the work, and only a task is work.
    if (row.type !== 'task') return readOnly;
    const { scope, ...cell } = state(row, 'effort');

    return (
      <EditableCell
        {...cell}
        kind="select"
        label={`Effort of ${row.title}`}
        value={row.effort}
        options={EFFORT_OPTIONS}
        align="center"
        mono
        tone={CELL.muted}
        onCommit={(next) => {
          if (!next) return;
          return controller.patch(
            ENTITY[row.type],
            row.id,
            { effort: next },
            { scope, undoLabel: `Effort on “${shortTitle(row.title)}” → ${next}` },
          );
        }}
      />
    );
  };

  const target: CellSlot = ({ row, readOnly }) => {
    // Only milestones store a target date; a goal's horizon is not one.
    if (row.type !== 'milestone') return readOnly;
    const { scope, ...cell } = state(row, 'target');

    return (
      <EditableCell
        {...cell}
        kind="date"
        label={`Target date for ${row.title}`}
        value={row.targetDate}
        // The read-only rendering, overdue rule and all, kept verbatim — this
        // cell edits the date, it does not restate how the table draws one.
        display={readOnly}
        align="right"
        mono
        // A date input will not fit in 68px, so it grows leftwards over Effort.
        editorClassName="min-w-[140px]"
        onCommit={(next) =>
          controller.patch(
            ENTITY[row.type],
            row.id,
            { targetDate: next },
            { scope, undoLabel: `Target on “${shortTitle(row.title)}”` },
          )
        }
      />
    );
  };

  return { status, title, competency, evidence, effort, target };
}

/* ------------------------------------------------------------ the admin table */

/**
 * The master table with every weekly-review field editable in place.
 *
 * Rendered only by /career/admin/table. The gate that decides whether this or
 * the plain `MasterTable` is drawn is cosmetic and known to be — every write
 * below goes through a route that calls `adminOnly()` for itself, and those
 * routes also revalidate the public /career tree, so the read-only view cannot
 * be left showing yesterday.
 */
export function EditableMasterTable({ data, today }: { data: MasterTableData; today: IsoDate }) {
  const controller = useInlineEdit();
  const { withOverrides } = controller;

  /**
   * Confirmed writes merged over the server's rows, until `router.refresh()`
   * lands with the real thing. Done here rather than per cell so the whole row
   * moves together: tick a task and its Completed date, its wash and its group
   * all change in the same frame, instead of the one cell you touched changing
   * and the rest of the line catching up a moment later.
   */
  const live = useMemo<MasterTableData>(
    () => ({
      competencies: data.competencies,
      goals: data.goals.map(withOverrides),
      milestones: data.milestones.map(withOverrides),
      tasks: data.tasks.map(withOverrides),
      wins: data.wins.map(withOverrides),
    }),
    [data, withOverrides],
  );

  const competencyOptions = useMemo<CellOption[]>(
    () =>
      [...data.competencies]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((competency) => ({ value: competency.id, label: competency.name })),
    [data.competencies],
  );

  const editors = useMemo(
    () => buildEditors(controller, competencyOptions),
    [controller, competencyOptions],
  );

  return (
    <>
      <MasterTable data={live} editable today={today} editors={editors} />
      <UndoToast controller={controller} />
    </>
  );
}

export default EditableCell;
