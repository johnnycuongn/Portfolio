'use client';

/**
 * Chart 3 — competency balance, plus the ladder that explains a row.
 *
 * A horizontal bar per competency, counting evidence items in the last 90 days.
 * Horizontal bars rather than a radar chart, on purpose and per the spec: bars are
 * readable at a glance and the entire point of the chart is to show the *shortest*
 * one. "Most engineers finish a year with thirty entries under technical judgment
 * and two under business impact. That gap is the thing that gates every promotion
 * above senior, and the dashboard should make it impossible to miss."
 *
 * Two consequences of that, both deliberate:
 *   - every competency gets a row even at zero. A chart that drops its empty bars
 *     hides the finding it exists to report.
 *   - the thinnest bar is drawn muted, not red. Colour here marks evidence you have
 *     accumulated; the short bar is an absence, and absences are not alarms. The
 *     note underneath says the thing in words instead.
 *
 * Instrument, not card. There is no box around either panel: a heading, a hairline
 * under it, and the marks below. What gives the chart its weight is the scale —
 * a ruled axis with real tick values, and those same ticks etched across the bars
 * so a bar can be read against the scale rather than only against its neighbours.
 * That is also why the bars are hand-written SVG and not a charting library: the
 * geometry is four rectangles and the axis is four lines and four labels.
 *
 * Every colour is a theme token — `var(--signal)` for the fills, `var(--ink-faint)`
 * for axis text — so the chart follows graphite through to riso without a hex
 * anywhere in this file.
 *
 * Clicking a bar drives the same selection the log's chips do, so the chart and
 * the log are two ends of one control: pick the short bar, read what little is
 * under it.
 */

import { useMemo } from 'react';

import { COMPETENCY_IDS } from '@/lib/career/types';

import { countEvidence, useAchievements, windowStart } from './Timeline';

/** The spec's default window. Long enough to smooth a quiet fortnight, short
 *  enough that closing a gap shows up before the next review. */
const DEFAULT_WINDOW_DAYS = 90;

/**
 * The bar column's grid. Declared once because the axis underneath has to sit in
 * the same tracks as the bars, and it is a sibling of the rows rather than a child
 * of one — two copies of this string that drift apart would misalign the scale.
 *
 * Phone: name and count on one line, bar full width beneath, so a long competency
 * name never squeezes the mark down to forty pixels. From `sm` it is one line.
 */
const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2rem] sm:gap-x-4 sm:gap-y-0';
const CELL_BAR = 'col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1';
const CELL_COUNT = 'col-start-2 row-start-1 text-right sm:col-start-3';

export type CompetencyBalanceProps = {
  /** Rolling window in days. Defaults to the spec's 90. */
  windowDays?: number;
  className?: string;
};

/**
 * A tick step that lands on readable numbers. Evidence counts are small integers,
 * so this is a short ladder rather than a general-purpose nice-number algorithm.
 */
function tickStep(max: number): number {
  for (const step of [1, 2, 5, 10, 20, 50, 100]) {
    if (max / step <= 5) return step;
  }
  return Math.ceil(max / 5);
}

export default function CompetencyBalance({
  windowDays = DEFAULT_WINDOW_DAYS,
  className,
}: CompetencyBalanceProps) {
  const { entries, competencies, selected, select, today } = useAchievements();

  const { rows, domainMax, step } = useMemo(() => {
    const counts = countEvidence(
      entries,
      competencies.map((c) => c.id),
      today,
      windowDays,
    );
    const values = competencies.map((c) => counts.get(c.id) ?? 0);
    const max = Math.max(1, ...values);
    const min = Math.min(...values);
    // The axis runs to a whole number of ticks past the tallest bar, never to a
    // fixed ceiling: with five items the shape of the gap is what matters.
    const s = tickStep(max);
    const domain = Math.max(s, Math.ceil(max / s) * s);
    return {
      step: s,
      domainMax: domain,
      rows: competencies.map((competency) => {
        const count = counts.get(competency.id) ?? 0;
        return {
          ...competency,
          count,
          // A non-zero count always draws something visible, so a bar of 1 is not
          // mistaken for a bar of 0.
          fraction: count === 0 ? 0 : Math.max(0.025, count / domain),
          thinnest: count === min,
        };
      }),
    };
  }, [entries, competencies, today, windowDays]);

  const thinnest = rows.filter((row) => row.thinnest);
  const allEqual = thinnest.length === rows.length;
  const from = windowStart(today, windowDays);

  // Every tick on the scale, and the interior ones the bars are ruled with — the
  // two ends of the scale are the ends of the track, so they are not drawn twice.
  const ticks = Array.from({ length: Math.floor(domainMax / step) + 1 }, (_, i) => i * step);
  const interior = ticks.slice(1, -1);

  return (
    <section className={`flex flex-col ${className ?? ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-strong pb-2">
        <h2 className="type-display text-[19px] text-ink sm:text-[21px]">Competency balance</h2>
        <span className="text-[12px] text-ink-muted">
          evidence items, last {windowDays} days
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {rows.map((row) => {
          const on = selected === row.id;
          // Muted, never red. The short bar is an absence, and absences are facts.
          const fill = row.thinnest && !allEqual ? 'var(--ink-faint)' : 'var(--signal)';
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => select(row.id)}
              aria-pressed={on}
              aria-label={`${row.name}: ${row.count} evidence ${
                row.count === 1 ? 'item' : 'items'
              } since ${from}. Filter the log to this competency.`}
              className={`${ROW_GRID} -mx-2 min-h-[44px] w-[calc(100%+1rem)] rounded-md px-2 py-2 text-left transition-colors ${
                on ? 'bg-surface-2' : 'hover:bg-surface-2'
              }`}
            >
              <span
                className={`type-condensed text-[13px] ${
                  on ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                {row.name}
              </span>

              <span
                className={`${CELL_BAR} relative block h-3 overflow-hidden rounded-[2px] bg-track sm:h-3.5`}
              >
                <svg
                  viewBox="0 0 100 14"
                  preserveAspectRatio="none"
                  className="absolute inset-0 block h-full w-full [-webkit-print-color-adjust:exact] [print-color-adjust:exact]"
                  aria-hidden="true"
                >
                  {/* The bar's length is the rect's own width in view-box units,
                      not a transform. A `scaleX` animation is the obvious way to
                      draw this and it is a trap: motion/react suppresses transform
                      animations under prefers-reduced-motion, which leaves the rect
                      at its unscaled full width — every bar reading 100% for the
                      readers least able to notice. Geometry that carries a value
                      does not belong in an animation. */}
                  <rect
                    x={0}
                    y={0}
                    width={row.fraction * 100}
                    height={14}
                    fill={fill}
                  />
                </svg>

                {/* The scale, etched across the mark rather than drawn behind it,
                    so a bar can be read off the axis without counting pixels.
                    HTML hairlines rather than SVG: a 1px rule stays 1px at any
                    container width, where an SVG rect under a non-uniform scale
                    would not. */}
                {interior.map((value) => (
                  <span
                    key={value}
                    aria-hidden
                    className="absolute top-0 h-full w-px bg-ground"
                    style={{ left: `${(value / domainMax) * 100}%` }}
                  />
                ))}
              </span>

              <span
                className={`${CELL_COUNT} type-condensed text-[13px] ${
                  on ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                {row.count}
              </span>
            </button>
          );
        })}

        {/* The axis sits in the bar's own grid tracks so its ticks line up with
            the etched ones above it. */}
        <div className={`${ROW_GRID} px-2`} aria-hidden="true">
          <span className="hidden sm:block" />
          <div className={CELL_BAR}>
            <svg className="block h-[17px] w-full" role="presentation">
              {ticks.map((value) => {
                const pct = (value / domainMax) * 100;
                // The end labels are pulled inside the track rather than centred
                // on it, so the scale never hangs off either edge of the column.
                const anchor = value === 0 ? 'start' : value === domainMax ? 'end' : 'middle';
                return (
                  <g key={value}>
                    <line
                      x1={`${pct}%`}
                      x2={`${pct}%`}
                      y1={0}
                      y2={3}
                      stroke="var(--rule-strong)"
                      strokeWidth={1}
                    />
                    <text
                      x={`${pct}%`}
                      y={14}
                      textAnchor={anchor}
                      fill="var(--ink-faint)"
                      fontSize={10.5}
                    >
                      {value}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <span className={CELL_COUNT} />
        </div>
      </div>

      <p className="mt-4 border-t border-rule pt-3 text-[12.5px] leading-[1.5] text-ink-muted">
        {balanceNote({ rows, thinnest, allEqual, selected, windowDays })}
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------- the caption */

type BalanceRow = { id: string; name: string; count: number; thinnest: boolean };

/**
 * The sentence under the chart. It states the gap plainly and stops — no target,
 * no "you should", nothing that turns a reading into a debt. The one licence the
 * spec grants is that the weakest competency "should quietly nag you".
 */
function balanceNote({
  rows,
  thinnest,
  allEqual,
  selected,
  windowDays,
}: {
  rows: BalanceRow[];
  thinnest: BalanceRow[];
  allEqual: boolean;
  selected: string | null;
  windowDays: number;
}): string {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (total === 0) {
    return `No evidence logged in the last ${windowDays} days. The first milestone you reach with a link on it starts this chart.`;
  }

  if (selected) {
    const row = rows.find((r) => r.id === selected);
    if (row) {
      return `Filtered to ${row.name}: ${row.count} ${row.count === 1 ? 'item' : 'items'} in ${windowDays} days. Each row below is an argument with a date and a link under it — that is the packet.`;
    }
  }

  if (allEqual) {
    return `Even across all five over the last ${windowDays} days. Nothing is thin, which is rarer than it sounds.`;
  }

  const names = thinnest.map((row) => row.name);
  const count = thinnest[0]?.count ?? 0;
  const subject =
    names.length === 1
      ? `${names[0]} is the short bar`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are the short bars`;
  const amount = count === 0 ? 'Nothing' : `${count} ${count === 1 ? 'item' : 'items'}`;

  return `${subject}. ${amount} in ${windowDays} days, against ${Math.max(...rows.map((r) => r.count))} at the top. The gap above senior is usually the one that stays thin.`;
}

/* ---------------------------------------------------------------- the ladder */

/**
 * The competency spine, straight from the spec. Five rows, fixed forever — what
 * changes between levels is the size of the evidence, not the rows. Showing it
 * next to the chart is what makes a short bar actionable: it names what a bigger
 * item under that row would actually have to look like.
 *
 * Four ruled cells rather than four cards, and no level is highlighted: the app
 * does not know which rung you are on, and colouring the first one would be an
 * assertion it cannot back. Colour is reserved for evidence you have filed.
 */
const LEVELS = ['Senior', 'Lead', 'EM', 'CTO'] as const;

const SPINE: Record<(typeof COMPETENCY_IDS)[number], { measure: string; levels: string[] }> = {
  technical_judgment: {
    measure: 'Quality of the calls you make and the ones you review',
    levels: [
      'Depth in your stack',
      "Design across a team's systems",
      'Reviewing decisions, not making them all',
      'Technology strategy and bets',
    ],
  },
  scope_of_ownership: {
    measure: 'How much breaks if you disappear',
    levels: [
      'A service or feature area',
      "A team's roadmap",
      'A group and its headcount',
      'The whole org and its budget',
    ],
  },
  people_impact: {
    measure: 'How much better others are because of you',
    levels: [
      'Reviews, unblocking peers',
      'Mentoring, raising the bar',
      'Hiring, performance, growth',
      'Leaders who grow leaders',
    ],
  },
  business_impact: {
    measure: "Money, users, risk — in the business's own language",
    levels: [
      'Feature outcomes',
      'Team outcomes vs cost',
      'Roadmap tied to revenue',
      'P&L, build-vs-buy, company bets',
    ],
  },
  communication_influence: {
    measure: 'Getting the right thing to happen without authority',
    levels: [
      'Clear docs and design reviews',
      'Cross-team alignment',
      'Exec and stakeholder management',
      'Board, customers, market',
    ],
  },
};

export function CompetencySpine({
  windowDays = DEFAULT_WINDOW_DAYS,
  className,
}: {
  windowDays?: number;
  className?: string;
}) {
  const { entries, competencies, selected, today } = useAchievements();

  // With no selection, show the thinnest row: it is the one worth reading, and
  // it means the panel is never blank waiting for a click.
  const shownId = useMemo(() => {
    if (selected && selected in SPINE) return selected as keyof typeof SPINE;
    const counts = countEvidence(
      entries,
      competencies.map((c) => c.id),
      today,
      windowDays,
    );
    let best = competencies[0]?.id ?? COMPETENCY_IDS[0];
    let bestCount = Number.POSITIVE_INFINITY;
    for (const competency of competencies) {
      const count = counts.get(competency.id) ?? 0;
      if (count < bestCount) {
        bestCount = count;
        best = competency.id;
      }
    }
    return (best in SPINE ? best : COMPETENCY_IDS[0]) as keyof typeof SPINE;
  }, [selected, entries, competencies, today, windowDays]);

  const spine = SPINE[shownId];
  const name = competencies.find((c) => c.id === shownId)?.name ?? shownId;

  return (
    // Stacked below the chart on a phone, beside it from lg: the rule moves from
    // the top edge to the left edge so the two panels stay separated either way
    // without either of them becoming a box.
    <section
      className={`flex flex-col border-t border-rule pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 ${className ?? ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-strong pb-2">
        <h2 className="type-display text-[19px] text-ink sm:text-[21px]">{name}</h2>
        <span className="text-[12px] text-ink-muted">{spine.measure}</span>
      </div>

      <p className="mb-4 mt-3 text-[12.5px] leading-[1.5] text-ink-muted">
        The rows never change. What changes with the level is the size of the evidence.
      </p>

      {/* A 1px gap over a ruled ground: hairlines on both axes as the grid
          reflows, with no per-edge border logic. */}
      <div className="grid gap-px border-y border-rule bg-rule sm:grid-cols-2 xl:grid-cols-4">
        {spine.levels.map((text, index) => (
          <div key={LEVELS[index]} className="flex flex-col gap-1.5 bg-ground px-3 py-3.5">
            <div className="type-condensed text-[11.5px] text-ink-muted">{LEVELS[index]}</div>
            <div className="text-[13px] leading-[1.4] text-ink">{text}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[12px] text-ink-muted">
        {selected
          ? 'Showing the ladder for the competency you filtered to.'
          : 'Showing the thinnest competency. Pick any bar to read another.'}
      </p>
    </section>
  );
}
