'use client';

/**
 * Screen 2 — the master table.
 *
 * One table. Every milestone, task and win is a row in it, with the goal and its
 * horizon denormalised into columns so reading a line never needs a join. The
 * dashboard and the achievement log are filtered views of this data, never
 * separate systems to keep in sync.
 *
 * This component is presentational plus filter state. It never mutates anything:
 * cells render read-only by default, and the admin tree supplies `editors` to
 * swap individual cells for editable ones. The same component serves both trees —
 * a read-only copy and an editable copy would drift apart inside a month.
 *
 * ## Shape
 *
 * Not a card. The grid is ruled straight onto the page ground between two
 * hairlines, the way a register is printed rather than the way a panel floats: a
 * table wrapped in a rounded white box on a white page is a box drawn around
 * nothing. The only raised surface is the row under the pointer, which lifts to
 * `surface` — the lift is the hover state, so no colour is spent on it.
 *
 * This is the one screen in the app that scrolls sideways. That scroll is owned by
 * the grid's own container; the page never moves horizontally, at any width. The
 * header row and the group headers stay stuck to the top of that container so a
 * column keeps its meaning four hundred rows down.
 *
 * ## Colour
 *
 * Inherited from the spec and not negotiable here: rows are coded by status only,
 * and colour marks what is *done*, never what is owed. So the Completed column
 * carries a `signal-soft` wash on the rows that have one — which turns that column
 * into a strip you can read at a glance for how much of the view is finished — and
 * nothing unfinished is tinted at all.
 *
 * Two exceptions, both of them literally true rather than motivational:
 *
 *   - A task sitting in Doing for more than 21 days gets a neutral rule down its
 *     leading edge and a plain day count. That is the honest signal a goal has
 *     stalled and this is the screen where it gets caught. It is grey, not red.
 *   - A target date that has genuinely been and gone on an unfinished row gets a
 *     thin `overdue` rule under the date. A row with no target date has no pace
 *     and is never marked.
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';

import Filters from './Filters';
import {
  EMPTY_CELL,
  PRESETS,
  ROW_TYPE_LABEL,
  STATUS_LABEL,
  applyFilters,
  buildTableRows,
  doingDays,
  evidenceLabel,
  formatDayMonth,
  groupRows,
  isOverdue,
  isStale,
  summarize,
  tableMinWidth,
  visibleColumns,
  type FilterState,
  type IsoDate,
  type MasterTableData,
  type RowType,
  type TableColumn,
  type TableRow,
} from './presets';

/* ---------------------------------------------------------------- editor slots */

/**
 * The seam the inline-edit half of this screen plugs into. A slot receives the row
 * and the read-only rendering this component would otherwise have drawn, and
 * returns whatever it likes — so an editor can fall back to `readOnly` while it is
 * saving, or wrap it, without reimplementing the cell.
 */
export type CellSlot = (context: { row: TableRow; readOnly: ReactNode }) => ReactNode;

/** Every cell a weekly review touches. Anything not supplied stays read-only. */
export type TableEditors = {
  status?: CellSlot;
  competency?: CellSlot;
  evidence?: CellSlot;
  effort?: CellSlot;
  target?: CellSlot;
  title?: CellSlot;
};

export type MasterTableProps = {
  data: MasterTableData;
  /** Admin tree passes true. Cosmetic only — the API is the real boundary. */
  editable: boolean;
  /** Today as `YYYY-MM-DD`, decided on the server so both renders agree. */
  today: IsoDate;
  /** Supplied by the admin tree to make individual cells editable in place. */
  editors?: TableEditors;
  /** Defaults to the "Everything open" preset. */
  initialFilters?: FilterState;
};

/* ------------------------------------------------------------------- row chrome */

/**
 * The type chip. Milestone and task are told apart by the indent as much as by the
 * chip, so both stay neutral; a win is by definition a finished thing, which is the
 * one condition under which the signal colour is allowed to appear.
 */
const TYPE_CHIP: Record<RowType, string> = {
  milestone: 'bg-surface-2 text-ink-muted',
  task: 'border border-rule text-ink-muted',
  win: 'bg-signal-soft text-ink',
};

/** Status is a word plus a 7px gauge: empty, neutral fill, signal fill. */
const STATUS_MARK: Record<TableRow['status'], string> = {
  todo: 'border border-rule-strong',
  doing: 'bg-ink-faint',
  done: 'bg-signal',
};

const STATUS_TEXT: Record<TableRow['status'], string> = {
  todo: 'text-ink-muted',
  doing: 'text-ink',
  done: 'text-ink-muted',
};

const ALIGN: Record<TableColumn['align'], string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/**
 * Row height is 44px rather than the 42 this grid would like, because the goal and
 * evidence links inside it have to be hittable with a thumb.
 */
const CELL = 'h-[44px] border-b border-rule align-middle';

/** Narrow, so ten columns fit. This is what the width axis is for. */
const DENSE = 'type-condensed text-[12.5px]';

function gutter(index: number, count: number): string {
  return [index === 0 ? 'pl-[18px]' : '', index === count - 1 ? 'pr-[18px]' : 'pr-3'].join(' ');
}

function Cell({ slot, row, children }: { slot?: CellSlot; row: TableRow; children: ReactNode }) {
  return <>{slot ? slot({ row, readOnly: children }) : children}</>;
}

/* ------------------------------------------------------------------- the table */

export default function MasterTable({
  data,
  editable,
  today,
  editors,
  initialFilters,
}: MasterTableProps) {
  const [filters, setFilters] = useState<FilterState>(
    () => initialFilters ?? PRESETS[0].filters(today),
  );

  const rows = useMemo(() => buildTableRows(data), [data]);
  const visible = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const groups = useMemo(() => groupRows(visible, filters.groupBy), [visible, filters.groupBy]);
  const summary = useMemo(() => summarize(visible, rows.length), [visible, rows.length]);

  // Grouping by goal or horizon prints that value on the header row, so the matching
  // column is 214px (or 106px) of repetition and comes out. Neither has an inline
  // editor, so nothing becomes unreachable by disappearing.
  const columns = useMemo(() => visibleColumns(filters.groupBy), [filters.groupBy]);
  const gridStyle: CSSProperties = { minWidth: tableMinWidth(columns) };
  const empty = visible.length === 0;

  const goalHref = (goalId: string) =>
    editable ? `/career/admin/goal/${goalId}` : `/career/goal/${goalId}`;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <Filters
        filters={filters}
        onChange={setFilters}
        competencies={data.competencies}
        today={today}
      />

      <section className="flex min-h-0 w-full min-w-0 flex-col">
        {empty ? (
          /*
            The empty state is NOT a `<td colSpan>` inside the grid, and this is
            the whole reason the branch exists. A cell in this table inherits the
            table's own width — 1086px — so inside a 358px scroller a centred
            sentence is laid out around x≈550 and the single line telling a new
            user what to do can only be reached by scrolling sideways. Out here
            it is an ordinary block that cannot be wider than the page.

            The header row goes with it: ten column labels stretched over nothing,
            scrolling sideways over nothing, are noise. The filters above and the
            readout below still say what this is.
          */
          <div className="flex min-h-[200px] w-full min-w-0 items-center justify-center border-y border-rule-strong bg-ground px-5 py-12">
            <p className="max-w-[44ch] text-center text-[13px] leading-relaxed text-ink-muted">
              {rows.length === 0
                ? 'Nothing here yet. The first goal you add shows up as rows on this table.'
                : 'No rows match these filters.'}
            </p>
          </div>
        ) : (
          /*
            The horizontal scroll lives here and only here. `min-w-0` on every
            ancestor is what keeps a 1288px grid from widening the page itself.

            Vertical extent: a share of the viewport on a phone, where the controls
            above have already used most of the first screen, and a fixed
            subtraction on a desktop, where the grid should reach the window's foot.
          */
          <div className="max-h-[66dvh] min-h-[260px] w-full min-w-0 overflow-auto border-y border-rule-strong sm:max-h-[calc(100dvh-290px)]">
            <table
              style={gridStyle}
              className="w-full table-fixed border-separate border-spacing-0 text-ink"
            >
              <caption className="sr-only">
                Every milestone, task and win, one per row. {summary.text}.
              </caption>

              <colgroup>
                {columns.map((column) => (
                  <col
                    key={column.id}
                    style={column.width ? { width: column.width } : undefined}
                  />
                ))}
              </colgroup>

              <thead>
                <tr>
                  {columns.map((column, index) => (
                    <th
                      key={column.id}
                      scope="col"
                      className={`sticky top-0 z-10 h-[40px] border-b border-rule-strong bg-surface-2 font-normal text-ink-muted ${DENSE} ${ALIGN[column.align]} ${gutter(index, columns.length)}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* No entrance animation here, deliberately. An opacity fade on the body
                  of a data table means the server-rendered HTML ships at opacity 0, so
                  a slow or failed client bundle shows an empty grid rather than the
                  rows it already has. Data renders; it does not arrive. */}
              <tbody>
                {groups.map((group) => (
                  <RowGroupSection key={group.key} group={group} span={columns.length}>
                    {group.rows.map((row) => {
                      const stale = isStale(row, today);

                      return (
                        <tr key={row.key} className="group bg-ground transition-colors hover:bg-surface">
                          {columns.map((column, index) => (
                            <BodyCell
                              key={column.id}
                              column={column}
                              index={index}
                              count={columns.length}
                              row={row}
                              today={today}
                              stale={stale}
                              editors={editors}
                              goalHref={goalHref}
                            />
                          ))}
                        </tr>
                      );
                    })}
                  </RowGroupSection>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/*
          The readout, on the ground with no box: done leads, the denominator is
          small beside it, and the grand total — the one this screen is allowed to
          show — is the quietest figure on the line.
        */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pt-3 text-[12.5px]">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-ink-muted">
            <span className="text-[16px] leading-none text-ink">{summary.done}</span>
            <span>done of {summary.shown} in this view</span>
            <span aria-hidden className="h-[11px] w-px shrink-0 self-center bg-rule-strong" />
            <span>{summary.total} rows in the table</span>
          </p>
          <p className="text-ink-muted">
            {/* No sideways hint when there is no grid to scroll. */}
            {!empty && (
              <span className="sm:hidden">Scroll the grid sideways for the rest of the columns</span>
            )}
            <span className={empty ? undefined : 'hidden sm:inline'}>
              {editable
                ? 'Status, competency and evidence edit in place and save on blur'
                : 'Read-only view'}
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------- a cell */

type BodyCellProps = {
  column: TableColumn;
  index: number;
  count: number;
  row: TableRow;
  today: IsoDate;
  stale: boolean;
  editors?: TableEditors;
  goalHref: (goalId: string) => string;
};

/**
 * One `<td>`. Kept as a single switch rather than nine hand-written cells so that
 * hiding a column cannot leave a header and a body disagreeing about what is in it.
 */
function BodyCell({
  column,
  index,
  count,
  row,
  today,
  stale,
  editors,
  goalHref,
}: BodyCellProps) {
  const pad = gutter(index, count);
  // The stale marker rides the leading edge of the row, wherever that edge now is.
  const edge = stale && index === 0 ? 'shadow-[inset_2px_0_0_var(--ink-muted)]' : '';
  // No background of its own: the cell is transparent so the row's own ground (or
  // its hover lift) shows through, and only the Completed wash ever overrides that.
  const base = `${CELL} ${ALIGN[column.align]} ${pad} ${edge}`;

  switch (column.id) {
    case 'goal':
      return (
        <td className={`${base} truncate ${DENSE} text-ink-muted`}>
          {row.goalId ? (
            <Link
              href={goalHref(row.goalId)}
              className="transition-colors hover:text-ink hover:underline hover:decoration-rule-strong hover:underline-offset-[3px]"
            >
              {row.goalTitle}
            </Link>
          ) : (
            <span>{row.goalTitle}</span>
          )}
        </td>
      );

    case 'horizon':
      return <td className={`${base} ${DENSE} text-ink-muted`}>{row.horizon}</td>;

    case 'item':
      return (
        <td className={base}>
          <div className="flex min-w-0 items-center gap-2.5">
            {row.level === 1 && <span className="w-[16px] shrink-0" aria-hidden />}
            <span
              className={`shrink-0 rounded-[3px] px-1.5 py-[2px] text-[10px] ${DENSE} ${TYPE_CHIP[row.type]}`}
            >
              {ROW_TYPE_LABEL[row.type]}
            </span>
            <Cell slot={editors?.title} row={row}>
              <span
                className={`truncate text-[13px] ${row.status === 'done' ? 'text-ink-muted' : 'text-ink'}`}
                title={row.title}
              >
                {row.title}
              </span>
            </Cell>
            {stale && <StaleNote row={row} today={today} />}
          </div>
        </td>
      );

    case 'status':
      return (
        <td className={base}>
          <Cell slot={editors?.status} row={row}>
            <span className={`flex items-center gap-2 ${DENSE} ${STATUS_TEXT[row.status]}`}>
              <span
                aria-hidden
                className={`h-[7px] w-[7px] shrink-0 rounded-[1px] ${STATUS_MARK[row.status]}`}
              />
              {STATUS_LABEL[row.status]}
            </span>
          </Cell>
        </td>
      );

    case 'competency':
      return (
        <td className={base}>
          <Cell slot={editors?.competency} row={row}>
            <span className={`block truncate ${DENSE} text-ink-muted`}>{row.competencyName}</span>
          </Cell>
        </td>
      );

    case 'effort':
      return (
        <td className={`${base} ${DENSE} text-ink-muted`}>
          <Cell slot={editors?.effort} row={row}>
            <span>{row.effort ?? <span className="text-ink-faint">{EMPTY_CELL}</span>}</span>
          </Cell>
        </td>
      );

    case 'target':
      return <TargetCell className={base} row={row} today={today} slot={editors?.target} />;

    case 'completed':
      // The one wash on the grid. Read down this column and you can see how much of
      // the view is finished without reading a single word.
      return (
        <td className={`${base} ${DENSE} ${row.completedAt ? 'bg-signal-soft text-ink' : 'text-ink-faint'}`}>
          {formatDayMonth(row.completedAt)}
        </td>
      );

    case 'evidence':
    default:
      return <EvidenceCell className={`${base} truncate`} row={row} slot={editors?.evidence} />;
  }
}

/**
 * The target date. Colour appears only when the date has genuinely passed on an
 * unfinished row, and then as a rule under the figure rather than as red text —
 * partly because it is quieter, partly because `overdue` on paper-warm grounds does
 * not clear 4.5:1 as small type in every theme.
 */
function TargetCell({
  className,
  row,
  today,
  slot,
}: {
  className: string;
  row: TableRow;
  today: IsoDate;
  slot?: CellSlot;
}) {
  const overdue = isOverdue(row, today);

  return (
    <td
      className={`${className} ${DENSE} ${
        overdue ? 'text-ink' : row.targetDate ? 'text-ink-muted' : 'text-ink-faint'
      }`}
    >
      <Cell slot={slot} row={row}>
        {/* The rule sits under the figure, not under the cell: a 2px line the full
            width of the column would read as an alarm, which this is not. */}
        <span className={overdue ? 'border-b-2 border-overdue pb-px' : undefined}>
          {formatDayMonth(row.targetDate)}
          {overdue && <span className="sr-only"> (target date has passed)</span>}
        </span>
      </Cell>
    </td>
  );
}

function EvidenceCell({
  className,
  row,
  slot,
}: {
  className: string;
  row: TableRow;
  slot?: CellSlot;
}) {
  const evidence = evidenceLabel(row);

  return (
    <td className={`${className} ${DENSE}`}>
      <Cell slot={slot} row={row}>
        {evidence ? (
          row.evidenceUrl ? (
            // The link keeps ink-strength text and spends the signal colour on the
            // underline, which is decoration and so is not held to text contrast.
            <a
              href={row.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline decoration-signal underline-offset-[3px] hover:decoration-2"
              title={row.evidenceUrl}
            >
              {evidence}
            </a>
          ) : (
            <span className="text-ink-muted" title={row.evidenceNote ?? ''}>
              {evidence}
            </span>
          )
        ) : (
          <span className="text-ink-faint">{EMPTY_CELL}</span>
        )}
      </Cell>
    </td>
  );
}

/** Grey, plain, and exactly as long as the fact it states. Never red. */
function StaleNote({ row, today }: { row: TableRow; today: IsoDate }) {
  const days = doingDays(row, today);
  if (days === null) return null;

  return (
    <span
      className={`shrink-0 whitespace-nowrap text-[11px] ${DENSE} text-ink-muted`}
      title={`In Doing since ${formatDayMonth(row.startedOn)}`}
    >
      {days} days in Doing
    </span>
  );
}

/* ------------------------------------------------------------- group header row */

/**
 * A sticky header row plus its rows. Rendered as a fragment rather than a `<tbody>`
 * per group so that one `<tbody>` fade covers the whole regroup, and so the sticky
 * offsets stay relative to the single scroll container.
 */
function RowGroupSection({
  group,
  span,
  children,
}: {
  group: { key: string; label: string; rows: TableRow[] };
  span: number;
  children: ReactNode;
}) {
  return (
    <>
      <tr>
        <th
          colSpan={span}
          scope="colgroup"
          className="sticky top-[40px] z-[5] h-[36px] border-b border-rule bg-ground px-[18px] text-left font-normal"
        >
          <span className="flex items-baseline gap-2.5">
            <span className="type-display text-[12.5px] text-ink">{group.label}</span>
            <span className="text-[11.5px] text-ink-muted">{group.rows.length}</span>
          </span>
        </th>
      </tr>
      {children}
    </>
  );
}
