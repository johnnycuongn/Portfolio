'use client';

/**
 * Master table — the controls above the grid.
 *
 * A search box, four preset buttons, four filter chips and a group-by dropdown.
 * That is the whole surface, and it stays the whole surface: the spec asks for no
 * saved views until the third time one has genuinely been wanted, and a chip that
 * only ever holds a handful of values does not need a combobox.
 *
 * Presentational — every change is handed straight back through `onChange`. The
 * state itself lives in Table.tsx, which is also where the filtering happens.
 *
 * ## At 390px
 *
 * The grid below scrolls sideways; these controls do not get to. Everything here
 * wraps: the search box goes full width, the four presets and the four chips wrap
 * onto as many lines as they need, and every control is 44px tall on a phone
 * (dropping to 34–36px where a pointer is doing the work).
 *
 * The one thing that will push a page sideways if you let it is an absolutely
 * positioned dropdown anchored to a chip that happens to sit near the right edge.
 * So the chip menus are anchored to the chip only from `sm` up; below that the
 * chip wrapper is `static`, the menu resolves against the whole chip row instead,
 * and it spans that row's full width. No measurement, no portal, no overflow.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  GROUP_BYS,
  GROUP_BY_LABEL,
  PRESETS,
  activePreset,
  chipDefs,
  hasActiveFilters,
  toggleValue,
  type ChipDef,
  type FilterState,
  type GroupBy,
  type IsoDate,
  type TableCompetency,
} from './presets';

export type FiltersProps = {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  competencies: readonly TableCompetency[];
  /** The server's idea of today, so "This quarter" is the same period on both sides. */
  today: IsoDate;
};

/** Phone-first: a thumb needs 44px, a pointer does not. */
const CONTROL = 'h-11 sm:h-9';
const FIELD =
  'rounded-[3px] border border-rule-strong bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-signal focus:outline-none';

/**
 * ONE idiom for "this control is on", shared with the timeline's toggles: a
 * `signal-soft` ground under full-strength ink with a signal rule. It is the
 * quietest of the three that were in the app and it is the right one here,
 * because a control strip should never out-shout the data it filters — the
 * inverted `bg-ink text-ground` pill this file used before was a near-white slab
 * glowing above a dark grid on carbon, legible but the loudest thing on screen.
 *
 * Presets and chips therefore no longer differ by treatment. They differ by
 * ROLE, which is what the difference should have been encoding all along:
 *   - a preset acts immediately and exactly one of them can be on (a view)
 *   - a chip opens a menu — it carries a disclosure caret and a count (a filter)
 */
const ON = 'border-signal bg-signal-soft text-ink';
const OFF = 'border-rule-strong bg-surface text-ink-muted hover:text-ink';

/** The label over each control group, matching Search and Group by above. */
const GROUP_LABEL = 'text-[11.5px] text-ink-muted';

/* ------------------------------------------------------------------ chip menu */

type ChipProps = {
  def: ChipDef;
  selected: readonly string[];
  onToggle: (value: string) => void;
  onClear: () => void;
};

function FilterChip({ def, selected, onToggle, onClear }: ChipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const active = selected.length > 0;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    // `static` below sm is deliberate: it hands the menu's positioning context up
    // to the chip row, which is what keeps the menu inside the viewport.
    <div ref={wrapRef} className="static sm:relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        className={[
          'flex items-center gap-2 rounded-[3px] border px-3.5 text-[12.5px] transition-colors',
          CONTROL,
          active ? ON : OFF,
        ].join(' ')}
      >
        {def.label}
        {active && (
          <span className="text-[11.5px] tabular-nums text-ink-muted">{selected.length}</span>
        )}
        {/* The caret is the role marker: this control opens a menu, a preset does not. */}
        <span
          aria-hidden
          className={`text-[7px] leading-none transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-[4px] border border-rule-strong bg-surface p-1.5 shadow-panel sm:left-auto sm:right-0 sm:w-64"
        >
          {def.options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[3px] px-2.5 text-[13px] text-ink hover:bg-surface-2 sm:min-h-[36px]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(option.value)}
                  className="h-4 w-4 shrink-0 accent-signal"
                />
                <span className="truncate">{option.label}</span>
              </label>
            );
          })}
          {active && (
            <button
              type="button"
              onClick={onClear}
              className="mt-1 flex min-h-[44px] w-full items-center border-t border-rule px-2.5 text-left text-[12px] text-ink-muted hover:text-ink sm:min-h-[36px]"
            >
              Clear {def.label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- filters */

export default function Filters({ filters, onChange, competencies, today }: FiltersProps) {
  const searchId = useId();
  const groupId = useId();
  const viewsId = useId();
  const chipsId = useId();
  const current = activePreset(filters, today);

  const setChip = useCallback(
    (key: ChipDef['key'], value: string) => {
      onChange({ ...filters, [key]: toggleValue(filters[key] as readonly string[], value) });
    },
    [filters, onChange],
  );

  const clearChip = useCallback(
    (key: ChipDef['key']) => onChange({ ...filters, [key]: [] }),
    [filters, onChange],
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="type-display text-[26px] text-ink sm:text-[30px]">Master table</h1>
        <p className="max-w-[62ch] text-[13px] text-ink-muted">
          Every goal, milestone and task in one place. The dashboard and the achievement log are
          filtered views of this.
        </p>
      </div>

      {/* Search owns its own line on a phone, and shares one with group-by from sm up. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-[320px]">
          <label htmlFor={searchId} className="text-[11.5px] text-ink-muted">
            Search
          </label>
          <input
            id={searchId}
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="title, goal or evidence"
            className={`w-full ${CONTROL} ${FIELD}`}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:w-[200px]">
          <label htmlFor={groupId} className="text-[11.5px] text-ink-muted">
            Group by
          </label>
          <select
            id={groupId}
            value={filters.groupBy}
            onChange={(event) => onChange({ ...filters, groupBy: event.target.value as GroupBy })}
            className={`w-full cursor-pointer ${CONTROL} ${FIELD}`}
          >
            {GROUP_BYS.map((value) => (
              <option key={value} value={value}>
                {GROUP_BY_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-rule pt-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="flex flex-col gap-1.5">
          <span id={viewsId} className={GROUP_LABEL}>
            View
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={viewsId}>
            {PRESETS.map((preset) => {
              const on = current === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChange(preset.filters(today))}
                  aria-pressed={on}
                  className={[
                    'rounded-[3px] border px-4 text-[12.5px] transition-colors',
                    CONTROL,
                    on ? ON : OFF,
                  ].join(' ')}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span id={chipsId} className={GROUP_LABEL}>
            Filter
          </span>
          {/* The positioning context the chip menus fall back to below sm. */}
          <div
            className="relative flex flex-wrap items-center gap-2"
            role="group"
            aria-labelledby={chipsId}
          >
            {chipDefs(competencies).map((def) => (
              <FilterChip
                key={def.key}
                def={def}
                selected={filters[def.key] as readonly string[]}
                onToggle={(value) => setChip(def.key, value)}
                onClear={() => clearChip(def.key)}
              />
            ))}
            {hasActiveFilters(filters) && (
              <button
                type="button"
                onClick={() => onChange(PRESETS[0].filters(today))}
                className={`px-3 text-[12px] text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink ${CONTROL}`}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
