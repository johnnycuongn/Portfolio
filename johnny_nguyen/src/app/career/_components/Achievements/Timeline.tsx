'use client';

/**
 * Screen 4 — the achievement timeline, and the shared state the whole screen runs on.
 *
 * This is the backward half of the app: a vertical chronological list of dated,
 * evidenced things that happened, grouped by month and tagged with exactly one
 * competency each. It is the thing you scroll before a performance review and the
 * thing you screen-share during one, so it has to read well full-screen and print
 * without a fight — hence the small print stylesheet at the bottom of this file,
 * which unsticks the month headers, keeps an entry off a page break, and prints
 * the evidence URL after each link so a paper packet is still checkable.
 *
 * Filtering by competency is the promotion-prep view the spec is really after:
 * "filter the log by competency, and each row becomes an argument with dated
 * evidence underneath it". That is why the chips sit in the log's own header at
 * full size rather than hiding in a toolbar, and why picking a bar in
 * CompetencyBalance drives the same filter — one selection, two entry points.
 *
 * Why the provider lives here rather than in the page: the pages are server
 * components, so they cannot hold the selection, and a function exported from a
 * 'use client' module cannot be *called* from a server component — only rendered.
 * So the raw rows cross the boundary as props, and everything derived from them
 * (the entries, the counts, the filter) is built once inside this provider and
 * read by the other panels through `useAchievements()`.
 *
 * Presentational. Nothing here mutates: `editable` changes which tree the links
 * point at and opens the `renderAction` seam, and that is all. The API routes are
 * the actual security boundary.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { COMPETENCY_SEED, type IsoDate } from '@/lib/career/types';
import { monthAbbr } from '@/lib/career/horizon';

/* ------------------------------------------------------------- source shapes */

/**
 * Structural shapes, not the drizzle row types. A `Milestone` / `Win` / `Goal`
 * row satisfies these by having more fields than they ask for, so the pages pass
 * rows straight through, and this module stays free of any database import — it
 * ships to the browser.
 */
export type MilestoneRow = {
  id: string;
  goalId: string;
  title: string;
  status: string;
  competencyId: string;
  evidenceUrl: string | null;
  evidenceNote: string | null;
  completedAt: IsoDate | null;
};

export type WinRow = {
  id: string;
  title: string;
  happenedOn: IsoDate;
  competencyId: string;
  impactNote: string | null;
  evidenceUrl: string | null;
};

export type GoalRow = {
  id: string;
  title: string;
  status: string;
  competencyId: string;
  closedOn: IsoDate | null;
  closeNote: string | null;
};

export type CompetencyRow = { id: string; name: string };

export type AchievementSource = {
  goals: GoalRow[];
  milestones: MilestoneRow[];
  wins: WinRow[];
  competencies: CompetencyRow[];
  /** Decided on the server so the 90-day window cannot differ across hydration. */
  today: IsoDate;
};

/* -------------------------------------------------------------------- entries */

/**
 * Three things end up in the log, and only three.
 *
 * `milestone` — the level that carries evidence, per the spec, and the reason the
 * log fills with checkpoints reached rather than chores ticked. Tasks are
 * deliberately absent: they drive progress bars and nothing else.
 * `win` — the unplanned achievements that never came from a goal and are often
 * the best promotion evidence.
 * `goal` — a completed goal is permanent and the spec's status table sends it
 * here. It is counted as a headline, not as evidence (see `countEvidence`),
 * because its milestones are already in the log and would double-count.
 */
export type EntryKind = 'milestone' | 'win' | 'goal';

export type AchievementEntry = {
  /** `kind:rowId` — stable across re-sorts and unique across the three sources. */
  id: string;
  kind: EntryKind;
  date: IsoDate;
  title: string;
  /** Evidence note, impact note or close note — whatever the row carries. */
  note: string | null;
  competencyId: string;
  competencyName: string;
  evidenceUrl: string | null;
  /** Null on a win: wins have no goal, so their titles do not link anywhere. */
  goalId: string | null;
};

const KIND_RANK: Record<EntryKind, number> = { milestone: 0, win: 1, goal: 2 };

export const KIND_LABEL: Record<EntryKind, string> = {
  milestone: 'Milestone',
  win: 'Win',
  goal: 'Goal',
};

/** Only the two evidence-carrying levels count toward competency balance. */
export const EVIDENCE_KINDS: ReadonlyArray<EntryKind> = ['milestone', 'win'];

function competencyNames(rows: CompetencyRow[]): Map<string, string> {
  const map = new Map<string, string>();
  // Seed first, rows second: a database that has not been seeded yet still shows
  // readable names instead of `business_impact`, and a renamed row wins.
  for (const seed of COMPETENCY_SEED) map.set(seed.id, seed.name);
  for (const row of rows) if (row.name) map.set(row.id, row.name);
  return map;
}

/**
 * Every dated achievement, newest first.
 *
 * Pure. A milestone with no `completedAt` is skipped rather than dated today —
 * inventing a date in the one artefact whose whole value is its dates would be
 * the worst possible place to guess.
 */
export function buildAchievementEntries(source: AchievementSource): AchievementEntry[] {
  const names = competencyNames(source.competencies);
  const nameOf = (id: string) => names.get(id) ?? id;

  const entries: AchievementEntry[] = [];

  for (const m of source.milestones) {
    if (m.status !== 'done' || !m.completedAt) continue;
    entries.push({
      id: `milestone:${m.id}`,
      kind: 'milestone',
      date: m.completedAt,
      title: m.title,
      note: m.evidenceNote,
      competencyId: m.competencyId,
      competencyName: nameOf(m.competencyId),
      evidenceUrl: m.evidenceUrl,
      goalId: m.goalId,
    });
  }

  for (const w of source.wins) {
    if (!w.happenedOn) continue;
    entries.push({
      id: `win:${w.id}`,
      kind: 'win',
      date: w.happenedOn,
      title: w.title,
      note: w.impactNote && w.impactNote.trim() ? w.impactNote : null,
      competencyId: w.competencyId,
      competencyName: nameOf(w.competencyId),
      evidenceUrl: w.evidenceUrl,
      goalId: null,
    });
  }

  for (const g of source.goals) {
    if (g.status !== 'done' || !g.closedOn) continue;
    entries.push({
      id: `goal:${g.id}`,
      kind: 'goal',
      date: g.closedOn,
      title: g.title,
      note: g.closeNote,
      competencyId: g.competencyId,
      competencyName: nameOf(g.competencyId),
      evidenceUrl: null,
      goalId: g.id,
    });
  }

  // ISO dates sort lexicographically, which is the whole reason they are strings.
  return entries.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.title.localeCompare(b.title),
  );
}

/** `today` minus `days`, as an ISO date. Pure string arithmetic on UTC days. */
export function windowStart(today: IsoDate, days: number): IsoDate {
  const ms = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(ms)) return today;
  // Inclusive window: 90 days means today and the 89 before it.
  return new Date(ms - (days - 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Evidence items per competency inside a rolling window.
 *
 * Every competency appears even at zero — the empty row *is* the finding, and a
 * chart that drops its shortest bar would hide the one thing it exists to show.
 */
export function countEvidence(
  entries: AchievementEntry[],
  competencyIds: string[],
  today: IsoDate,
  days: number,
): Map<string, number> {
  const from = windowStart(today, days);
  const counts = new Map<string, number>();
  for (const id of competencyIds) counts.set(id, 0);
  for (const entry of entries) {
    if (!EVIDENCE_KINDS.includes(entry.kind)) continue;
    if (entry.date < from || entry.date > today) continue;
    counts.set(entry.competencyId, (counts.get(entry.competencyId) ?? 0) + 1);
  }
  return counts;
}

/* -------------------------------------------------------------------- context */

type AchievementsContext = {
  /** Every entry, newest first. */
  entries: AchievementEntry[];
  /** `entries` narrowed to the selected competency. */
  filtered: AchievementEntry[];
  /** Competencies in their fixed order, names resolved. */
  competencies: CompetencyRow[];
  selected: string | null;
  select: (competencyId: string | null) => void;
  today: IsoDate;
};

const Context = createContext<AchievementsContext | null>(null);

/** Throws outside the provider, deliberately: every panel here needs the data. */
export function useAchievements(): AchievementsContext {
  const value = useContext(Context);
  if (!value) throw new Error('useAchievements must be used inside <AchievementsProvider>');
  return value;
}

/**
 * Holds the screen's one piece of state — which competency is selected — and
 * derives everything else from the rows the server handed down.
 *
 * The selection is client state rather than a URL param on purpose: this filter
 * gets clicked through repeatedly while talking, and a server round-trip per
 * chip on a `force-dynamic` page would stutter in exactly the moment the screen
 * exists for.
 */
export function AchievementsProvider({
  source,
  children,
}: {
  source: AchievementSource;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const entries = useMemo(() => buildAchievementEntries(source), [source]);

  const competencies = useMemo<CompetencyRow[]>(() => {
    const names = competencyNames(source.competencies);
    // The five rows are fixed forever, so the order comes from the seed, not from
    // whatever order the database happened to return.
    return COMPETENCY_SEED.map((seed) => ({ id: seed.id, name: names.get(seed.id) ?? seed.name }));
  }, [source.competencies]);

  const filtered = useMemo(
    () => (selected ? entries.filter((e) => e.competencyId === selected) : entries),
    [entries, selected],
  );

  const value = useMemo<AchievementsContext>(
    () => ({
      entries,
      filtered,
      competencies,
      selected,
      select: (id) => setSelected((current) => (current === id ? null : id)),
      today: source.today,
    }),
    [entries, filtered, competencies, selected, source.today],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/* ------------------------------------------------------------------ formatting */

const MONTH_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * `2026-09-16` → `16 Sep`. Hand-rolled rather than `toLocaleDateString`, for the
 * same reason the horizon labels are: ICU renders September as "Sep" or "Sept"
 * depending on the runtime, and the server and the browser do not have to agree.
 */
export function formatEntryDate(iso: IsoDate): string {
  const [, month, day] = iso.split('-');
  const m = Number(month);
  if (!m || m < 1 || m > 12) return iso;
  return `${Number(day)} ${monthAbbr(m)}`;
}

/** `2026-09-16` → `September 2026`. */
export function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const m = Number(month);
  if (!m || m < 1 || m > 12) return monthKey;
  return `${MONTH_FULL[m - 1]} ${year}`;
}

/** A link's host, which is a more useful label than the whole URL in a 120px column. */
export function evidenceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    const last = path.split('/').filter(Boolean).pop();
    return last ? `${parsed.hostname.replace(/^www\./, '')}/${last}` : parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

type MonthGroup = { key: string; label: string; entries: AchievementEntry[] };

/** Consecutive runs by month. The list is already sorted, so one pass does it. */
export function groupByMonth(entries: AchievementEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, label: formatMonth(key), entries: [entry] });
  }
  return groups;
}

/* -------------------------------------------------------------------- summary */

export type AchievementTotals = {
  milestones: number;
  wins: number;
  goals: number;
  evidence: number;
};

/**
 * All-time and always rising. The spec asks for at least one number on this screen
 * that cannot go down: a bad quarter cannot take a milestone back off this list,
 * which is exactly what makes it worth showing on the week everything feels stalled.
 */
export function allTimeTotals(entries: AchievementEntry[]): AchievementTotals {
  let milestones = 0;
  let wins = 0;
  let goals = 0;
  let evidence = 0;
  for (const entry of entries) {
    if (entry.kind === 'milestone') milestones += 1;
    else if (entry.kind === 'win') wins += 1;
    else goals += 1;
    if (entry.evidenceUrl || entry.note) evidence += 1;
  }
  return { milestones, wins, goals, evidence };
}

/**
 * The three rising numbers in the page header.
 *
 * Read as a gauge face, not as cards: oversized stretched figures, a hairline
 * between them, nothing boxed. Only the headline figure wears the signal colour,
 * and it wears it at readout size where a 3:1 hue is legitimate — the other two
 * are ink, so the strip reads as one instrument with one needle rather than three
 * competing highlights.
 */
export function AchievementsSummary() {
  const { entries } = useAchievements();
  const totals = useMemo(() => allTimeTotals(entries), [entries]);

  const figures: { value: number; label: string; signal?: boolean }[] = [
    { value: totals.milestones, label: 'milestones, all time', signal: true },
    { value: totals.wins, label: 'unplanned wins' },
    { value: totals.evidence, label: 'entries with evidence' },
  ];

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 sm:gap-x-0">
      {figures.map((figure) => (
        <div
          key={figure.label}
          // The hairlines only appear once the strip is guaranteed to be on one
          // line: a rule to the left of a figure that has wrapped onto a new row
          // is pointing at nothing.
          className="flex flex-col gap-1.5 sm:items-end sm:border-l sm:border-rule sm:px-5 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0"
        >
          <span
            className={`type-readout text-[30px] sm:text-[34px] ${
              figure.signal ? 'text-signal' : 'text-ink'
            }`}
          >
            {figure.value}
          </span>
          <span className="text-[11.5px] leading-snug text-ink-muted">{figure.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- filter styling */

/**
 * The filter is the reason this screen exists, so it is full size, it sits in the
 * log's own header, and every chip carries its count. Picking one turns the list
 * below into a single argument with dated evidence under it.
 *
 * Selected is an ink inversion rather than a signal fill. Two reasons: the signal
 * colour marks what is *done*, and "currently filtered" is not an achievement; and
 * an inverted ink chip clears 4.5:1 in all six themes, which a fluorescent fill
 * with 12px text on it does not.
 */
const CHIP_BASE =
  'inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3 text-[12.5px] transition-colors';
const CHIP_OFF =
  'border-rule-strong bg-surface text-ink-muted hover:border-ink-faint hover:text-ink';
const CHIP_ON = 'border-ink bg-ink text-ground';

/**
 * The tick on the log's spine. Shape codes the kind, colour only ever says "done"
 * — every row in this log is a finished thing, which is what licenses the signal
 * here at all. The kind is also written out in words beside the date, so nobody
 * has to learn the shapes.
 */
const KIND_MARK: Record<EntryKind, string> = {
  win: 'rounded-full bg-signal',
  milestone: 'rounded-full border border-signal bg-ground',
  goal: 'bg-signal',
};

/**
 * The print sheet. Cheap, and this page gets printed — a packet handed across a
 * desk is a real use of this screen.
 *
 * Four jobs: drop the controls, unstick the month headers (a `position: sticky`
 * header prints once at the top of page one and never again), keep an entry off a
 * page break, and write each evidence URL out after its link so a paper copy is
 * still checkable. Colours are forced on because a log of achievements printed as
 * grey rules is missing the one thing it is reporting.
 */
const PRINT_CSS = `
@media print {
  .ledger-log .no-print { display: none !important; }
  .ledger-log .month-head {
    position: static !important;
    break-after: avoid;
    page-break-after: avoid;
  }
  .ledger-log .log-entry {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .ledger-log a[href^="http"]::after {
    content: " " attr(href);
    color: var(--ink-faint);
    font-size: 9px;
    word-break: break-all;
  }
  .ledger-log,
  .ledger-log * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;

/* -------------------------------------------------------------------- the log */

export type AchievementTimelineProps = {
  /** Admin tree passes true: it repoints the goal links and opens `renderAction`. */
  editable: boolean;
  /**
   * A per-row slot for the wins/mutation half of this screen. Only usable from a
   * client parent (a function prop cannot cross the server boundary); absent, rows
   * render read-only, which is what both pages do today.
   */
  renderAction?: (entry: AchievementEntry) => ReactNode;
  className?: string;
};

/**
 * The log is the hero of this screen, so it is not in a card and it does not
 * scroll inside one either — the page scrolls, the month headers stick, and the
 * whole thing prints in one pass. Its structure is a spine: a hairline down the
 * left with the date in the gutter beside it and a tick per entry, month labels
 * breaking the run. That is a chronology drawn as a chronology, rather than a
 * stack of identical rounded rectangles.
 */
export default function AchievementTimeline({
  editable,
  renderAction,
  className,
}: AchievementTimelineProps) {
  const { entries, filtered, competencies, selected, select } = useAchievements();
  const reduceMotion = useReducedMotion();

  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  // All-time counts, not the chart's 90-day window: a chip tells you how much
  // argument exists under that competency in total, which is the question you are
  // asking when you click it.
  const chipCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      map.set(entry.competencyId, (map.get(entry.competencyId) ?? 0) + 1);
    }
    return map;
  }, [entries]);

  const selectedName = competencies.find((c) => c.id === selected)?.name ?? null;
  const goalBase = editable ? '/career/admin/goal' : '/career/goal';

  return (
    <section className={`ledger-log flex flex-col gap-4 ${className ?? ''}`}>
      <style>{PRINT_CSS}</style>

      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-strong pb-2">
          {/* Sized to match the other section headings on this screen (the balance
              chart and the ladder), not above them: the log is the hero here by
              width and position, and a second heading scale for it would put a
              section head within four pixels of the screen's own <h1>. */}
          <h2 className="type-display text-[19px] text-ink sm:text-[21px]">
            {selectedName ?? 'Every dated achievement'}
          </h2>
          <span className="text-[12.5px] text-ink-muted">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}, newest first
          </span>
        </div>

        <div
          className="no-print flex flex-wrap gap-2"
          role="group"
          aria-label="Filter the log by competency"
        >
          <button
            type="button"
            onClick={() => select(null)}
            aria-pressed={selected === null}
            className={`${CHIP_BASE} ${selected === null ? CHIP_ON : CHIP_OFF}`}
          >
            All
            <span className="type-condensed">{entries.length}</span>
          </button>
          {competencies.map((competency) => {
            const on = selected === competency.id;
            return (
              <button
                key={competency.id}
                type="button"
                onClick={() => select(competency.id)}
                aria-pressed={on}
                className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                {competency.name}
                <span className={`type-condensed ${on ? '' : 'text-ink-muted'}`}>
                  {chipCounts.get(competency.id) ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* On paper the chips are gone, so the state they were in has to be said. */}
        <p className="hidden text-[12px] text-ink-muted print:block">
          {selectedName
            ? `Filtered to ${selectedName}.`
            : 'All competencies, unfiltered.'}{' '}
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="border-y border-rule py-10 text-center text-[13px] text-ink-muted">
          {selectedName
            ? `Nothing logged under ${selectedName} yet. That gap is the finding, not a failure.`
            : 'Nothing logged yet. Reaching a milestone or recording a win puts the first row here.'}
        </p>
      ) : (
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            // Re-keyed on the filter so switching competencies replays the change
            // rather than silently swapping the rows underneath you. This is the
            // one entrance on the screen, and it answers a click.
            key={selected ?? 'all'}
            initial={reduceMotion ? false : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.3, 1] }}
          >
            {groups.map((group) => (
              <div key={group.key}>
                <div className="month-head sticky top-0 z-10 flex items-baseline gap-3 border-b border-rule-strong bg-ground pb-1.5 pt-5">
                  <h3 className="type-display text-[16px] text-ink sm:text-[17px]">
                    {group.label}
                  </h3>
                  <span className="type-condensed text-[12px] text-ink-muted">
                    {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                {group.entries.map((entry) => (
                  <article
                    key={entry.id}
                    className="log-entry grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 border-b border-rule py-3 sm:grid-cols-[76px_minmax(0,1fr)] sm:gap-x-6"
                  >
                    {/* The gutter: the date, the kind, and the border that draws
                        the spine. Because the rows stack, each row's right border
                        continues the one above it into a single unbroken rule. */}
                    <div className="flex flex-col items-end gap-0.5 border-r border-rule pr-3 text-right sm:pr-6">
                      <time dateTime={entry.date} className="type-condensed text-[12.5px] text-ink">
                        {formatEntryDate(entry.date)}
                      </time>
                      <span className="type-condensed text-[11px] text-ink-muted">
                        {KIND_LABEL[entry.kind]}
                      </span>
                    </div>

                    <div className="relative flex min-w-0 flex-col gap-1">
                      <span
                        aria-hidden
                        className={`absolute -left-[16px] top-[6px] h-[7px] w-[7px] [-webkit-print-color-adjust:exact] [print-color-adjust:exact] sm:-left-[28px] ${KIND_MARK[entry.kind]}`}
                      />

                      {entry.goalId ? (
                        <Link
                          href={`${goalBase}/${entry.goalId}`}
                          className="break-words text-[15px] leading-[1.35] tracking-[-0.005em] text-ink decoration-signal decoration-1 underline-offset-2 hover:underline sm:text-[15.5px]"
                        >
                          {entry.title}
                        </Link>
                      ) : (
                        // `break-words`: the gutter is a fixed 52px at 390, so a
                        // title with one long unbroken token (a branch name, a
                        // ticket slug) would otherwise push the page sideways.
                        <span className="break-words text-[15px] leading-[1.35] tracking-[-0.005em] text-ink sm:text-[15.5px]">
                          {entry.title}
                        </span>
                      )}

                      {entry.note ? (
                        <span className="break-words text-[12.5px] leading-[1.45] text-ink-muted">
                          {entry.note}
                        </span>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {/* Second entry point to the same filter: read a row, then
                            pull the rest of the argument it belongs to. */}
                        <button
                          type="button"
                          onClick={() => select(entry.competencyId)}
                          className="inline-flex min-h-[44px] items-center rounded-[3px] bg-surface-2 px-2 text-[11.5px] text-ink-muted transition-colors hover:bg-signal-soft hover:text-ink sm:min-h-[28px]"
                        >
                          {entry.competencyName}
                        </button>

                        {entry.evidenceUrl ? (
                          <a
                            href={entry.evidenceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex min-h-[44px] min-w-0 items-center text-[12.5px] text-ink decoration-signal decoration-1 underline-offset-4 hover:underline sm:min-h-[28px]"
                          >
                            <span className="truncate">{evidenceLabel(entry.evidenceUrl)}</span>
                          </a>
                        ) : (
                          <span className="text-[12px] text-ink-muted">no link</span>
                        )}

                        {renderAction ? renderAction(entry) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </section>
  );
}
