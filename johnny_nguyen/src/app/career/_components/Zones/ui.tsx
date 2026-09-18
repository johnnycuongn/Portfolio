/**
 * The handful of shapes every zone shares.
 *
 * The rewrite's one structural idea: a zone is not a card. Three of the four zones
 * are now nothing but a heading, a hairline and rows — the only zone that earns a
 * raised surface is Recently completed, because the spec asks for exactly one rich
 * zone and a page where everything is raised has no hierarchy left to spend.
 *
 * The progress bar is the workhorse of the dashboard — "the gap between the fill and
 * the marker is the whole story, readable in half a second" — so it lives in one
 * place and every zone draws the same one. Hand-rolled divs, no chart library: a
 * track, a fill in the signal colour, and a single hairline marker. Nothing
 * incomplete is coloured, and the corners are near-square because this is an
 * instrument reading, not a pill.
 *
 * Every colour here is a theme token. A hex would survive graphite and then be
 * invisible in carbon.
 */

import type { ReactNode } from 'react';

/**
 * The zone heading. No eyebrow label above it, no accented word inside it: a name,
 * a hairline under it, and whatever small aside the zone needs at the right.
 *
 * Sized *under* the timeline's own heading on purpose. A zone label is a signpost,
 * not a headline — when it out-measured the hero the page had four competing titles
 * and no centre. `quiet` takes it down one further step, for the backlog, which is
 * the least urgent thing on the screen and should read that way.
 */
export function ZoneHeading({
  title,
  aside,
  quiet = false,
}: {
  title: string;
  aside?: ReactNode;
  quiet?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule-strong pb-2">
      <h2
        className={`type-display ${
          quiet ? 'text-[13.5px] text-ink-muted' : 'text-[15px] text-ink sm:text-[16px]'
        }`}
      >
        {title}
      </h2>
      {aside ? (
        <div className="flex shrink-0 items-center text-[12px] text-ink-muted">{aside}</div>
      ) : null}
    </div>
  );
}

/**
 * A raised panel. Used by Recently completed and by nothing else on the dashboard —
 * if a second zone starts reaching for this, the hierarchy has gone flat again.
 */
export function Surface({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-rule bg-surface shadow-panel ${className}`}>
      {children}
    </div>
  );
}

/** `S` / `M` / `L`. Tabular figures are global, so no monospace face is needed. */
export function EffortTag({ effort }: { effort: string }) {
  return <span className="type-condensed shrink-0 text-[11.5px] text-ink-muted">{effort}</span>;
}

export function CompetencyChip({ name }: { name: string }) {
  if (!name) return null;
  return (
    <span className="rounded-[3px] bg-surface-2 px-[6px] py-[2px] text-[11px] text-ink-muted">
      {name}
    </span>
  );
}

/**
 * How a pace reading is allowed to be coloured.
 *
 * `behind` is deliberately *not* red. A goal can be behind its own pace line for a
 * fortnight and be entirely fine; the spec's rule is that only a real date that has
 * genuinely passed earns the overdue colour. Being ahead is the only thing that gets
 * the signal, because being ahead is a fact about what you have already done — and
 * it gets it on the dot rather than on the figure, because the signal is a 3:1
 * colour in riso and 3:1 is not enough under 24px.
 *
 * Taken from `paceBand` rather than the VM's `paceColor`, which is a fixed hex and
 * cannot follow the theme.
 */
export type PaceBandLike = 'ahead' | 'slightly-behind' | 'behind' | 'none' | string;

export function paceToneClass(band: PaceBandLike, pastTarget = false): string {
  if (pastTarget) return 'text-overdue';
  if (band === 'ahead') return 'text-ink';
  return 'text-ink-muted';
}

function paceFillClass(band: PaceBandLike, pastTarget = false): string {
  if (pastTarget) return 'bg-overdue';
  if (band === 'ahead') return 'bg-signal';
  return 'bg-ink-faint';
}

/**
 * The pace dot. Drawn only when the goal has a horizon — `none` draws nothing, which
 * is the whole point of being allowed to leave the horizon off.
 */
export function PaceDot({
  band,
  pastTarget = false,
}: {
  band: PaceBandLike;
  pastTarget?: boolean;
}) {
  if (band === 'none') return null;
  return (
    <span
      aria-hidden
      className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${paceFillClass(band, pastTarget)}`}
    />
  );
}

/**
 * The progress bar.
 *
 * `elapsedPct` null means the goal has no horizon, and then there is no marker at
 * all — not a marker at zero, not a grey one. A goal with no horizon is never shown
 * as being behind.
 */
export function ProgressBar({
  pct,
  elapsedPct,
  pastTarget = false,
  height = 6,
  label,
}: {
  pct: number;
  elapsedPct: number | null;
  pastTarget?: boolean;
  height?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="relative rounded-[2px] bg-track"
      style={{ height }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        // Overdue red only when a real date exists and has genuinely passed — never
        // for merely being slow, and never for a goal with no horizon at all.
        className={`h-full rounded-[2px] transition-[width] duration-500 ease-[cubic-bezier(.2,.7,.3,1)] ${
          pastTarget && clamped < 100 ? 'bg-overdue' : 'bg-signal'
        }`}
        style={{ width: `${clamped}%` }}
      />
      {elapsedPct === null ? null : (
        <div
          aria-hidden
          className="absolute w-px bg-ink-faint"
          style={{ left: `${Math.max(0, Math.min(100, elapsedPct))}%`, top: -3, bottom: -3 }}
          title="Where you would be, by today's date"
        />
      )}
    </div>
  );
}

/**
 * A figure and its unit: the done count loud, the total small and muted beside it.
 * Never "8 remaining".
 */
export function Tally({
  done,
  of,
  size = 'sm',
}: {
  done: number | string;
  of: string;
  size?: 'sm' | 'lg';
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={`type-readout text-ink ${size === 'lg' ? 'text-[26px]' : 'text-[17px]'}`}
      >
        {done}
      </span>
      <span className="type-condensed text-[11.5px] text-ink-muted">{of}</span>
    </span>
  );
}

/** A calm empty state. Never a prompt, never a nag — a statement of fact. */
export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-[12.5px] text-ink-muted">{children}</div>;
}
