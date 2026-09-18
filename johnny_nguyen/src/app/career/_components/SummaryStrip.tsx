/**
 * The readout strip across the top of the four zones.
 *
 * This is where the instrument reads loudest, and it is the only place on the
 * dashboard allowed to be loud. The figures are oversized and stretched to the top
 * of Archivo's width axis; everything that explains them is small and quiet
 * underneath, at a sixth of the size. There is no card around it — the strip is
 * ruled, like a gauge face, not boxed.
 *
 * Loud is relative, so something has to be quiet for it to mean anything. The
 * completed figures take the large tier and `goals active` — the one reading that
 * counts something unfinished — takes the small one. See `Readout` below.
 *
 * Five readings, and the choice of which five is the whole design:
 *
 *   - **Active goals** — how much is genuinely in play.
 *   - **Milestones this month** — the near-term, which can be a zero and that is
 *     fine, because the number beside it cannot.
 *   - **This quarter** — `23` done with `of 31` small and muted, plus a hairline
 *     meter. Never "8 remaining".
 *   - **All time** — the spec's "something all-time and always rising". On a week
 *     where everything feels stalled this line is the honest counter-argument, and
 *     it is the only figure here wearing the signal colour.
 *   - **The thinnest competency** — the one figure that should quietly nag you.
 *     Most engineers finish a year with thirty entries under technical judgment and
 *     two under business impact, and that gap gates every promotion above senior.
 *
 * Note what is not here: no total of everything open, and no streak. A server
 * component — it renders numbers and nothing is interactive.
 *
 * The hairlines come from a 1px grid gap over a ruled background, which is what
 * gives rules between the cells on both axes as the strip reflows, without a border
 * that has to know which edge it is on.
 */

import type { SummaryVM } from './Zones/derive';

/**
 * Loudness here comes from scale and weight, not from width. Archivo's width
 * axis runs to 125, and taking the top of it stretched the figures until a `0`
 * read as a letter O — at 74px the counters open up far faster than they do at
 * text size. Width now moves only a little above normal; the size does the work.
 *
 * Scale, width and weight are the only three levers used here. Colour is not one
 * of them — the accent belongs to work that is finished, and borrowing it for
 * emphasis would make an unfinished number look done.
 */
const LOUD = { fontVariationSettings: "'wdth' 108, 'wght' 620" } as const;
const READING = { fontVariationSettings: "'wdth' 100, 'wght' 500" } as const;

function Cell({
  children,
  label,
  className = '',
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2.5 bg-ground px-4 py-5 sm:px-5 sm:py-6 ${className}`}>
      {/* Sized to the tallest figure so every cell's label sits on one line
          across the strip, whatever is above it. */}
      <div className="flex min-h-[48px] items-end sm:min-h-[59px] lg:min-h-[68px]">{children}</div>
      <div className="text-[11.5px] leading-snug text-ink-muted">{label}</div>
    </div>
  );
}

/**
 * Two tiers, and which figure gets which is an argument rather than a rhythm.
 *
 * `loud` is for work that is finished — milestones reached, tasks done, the
 * all-time count. `reading` is for goals that are merely open. Nothing
 * incomplete is coloured here, and for the same reason nothing incomplete is
 * shouted: an instrument that sizes "12 goals active" like "413 milestones
 * reached" is telling you that starting things and finishing them weigh the
 * same, which is the exact belief this dashboard exists to argue with.
 */
function Readout({
  children,
  signal = false,
  scale = 'loud',
}: {
  children: React.ReactNode;
  signal?: boolean;
  scale?: 'loud' | 'reading';
}) {
  const size =
    scale === 'loud'
      ? 'text-[52px] sm:text-[64px] lg:text-[74px]'
      : 'text-[34px] sm:text-[40px] lg:text-[46px]';

  return (
    <span
      className={`type-readout ${size} ${signal ? 'text-signal' : 'text-ink'}`}
      style={scale === 'loud' ? LOUD : READING}
    >
      {children}
    </span>
  );
}

export default function SummaryStrip({ summary }: { summary: SummaryVM }) {
  const quarterPct = Math.max(0, Math.min(100, summary.quarterPct));

  return (
    <section
      aria-label="Summary"
      className="grid grid-cols-2 gap-px border-y border-rule bg-rule sm:grid-cols-3 lg:grid-cols-5"
    >
      {/* The only reading here that counts something unfinished, and the only
          one held back to the quieter tier. */}
      <Cell label="goals active">
        <Readout scale="reading">{summary.activeGoals}</Readout>
      </Cell>

      <Cell label="milestones reached this month">
        <Readout>{summary.milestonesThisMonth}</Readout>
      </Cell>

      <Cell label={`tasks done in ${summary.quarterLabel}`}>
        <div className="flex w-full flex-col gap-2">
          {/* `flex-wrap` so a four-figure quarter drops "of N" to the next line
              instead of pushing the cell wider than the 390px column. */}
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            {/* Done is the loud number: the total is small, muted, and second. */}
            <Readout>{summary.quarterDone}</Readout>
            <span className="type-condensed text-[12.5px] text-ink-muted">
              of {summary.quarterTotal}
            </span>
          </div>
          <div
            className="h-[3px] w-full max-w-[220px] rounded-[1px] bg-track"
            role="img"
            aria-label={`${quarterPct} per cent of this quarter's tasks done`}
          >
            <div className="h-full rounded-[1px] bg-signal" style={{ width: `${quarterPct}%` }} />
          </div>
        </div>
      </Cell>

      <Cell
        label={
          summary.sinceLabel
            ? `milestones reached since ${summary.sinceLabel}`
            : 'milestones reached all time'
        }
      >
        <Readout signal>{summary.allTimeMilestones}</Readout>
      </Cell>

      <Cell label="thinnest competency by evidence, last 90 days" className="col-span-2 lg:col-span-1">
        <div className="flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {/* A name, not a figure, so it stays in display type — but it has to
              hold a cell next to a 74px number without looking like a caption. */}
          <span className="type-display text-[20px] leading-tight text-ink sm:text-[23px] lg:text-[25px]">
            {summary.weakest?.name ?? 'Nothing recorded yet'}
          </span>
          {summary.weakest ? (
            <span className="type-condensed text-[12.5px] text-ink-muted">
              {summary.weakest.count} {summary.weakest.count === 1 ? 'item' : 'items'}
            </span>
          ) : null}
        </div>
      </Cell>
    </section>
  );
}
