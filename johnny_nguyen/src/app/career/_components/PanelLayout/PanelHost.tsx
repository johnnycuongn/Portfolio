'use client';

/**
 * Panel customisation: the render half.
 *
 * Single column, vertical reorder only. No free-form grid, no resizing, no
 * drag-to-a-column. A layout engine is a week of work and a permanent source of
 * bugs, and the win over simple reordering is small when the panels are all
 * full-width by nature. The one exception the spec allows is Up next and Backlog
 * pairing side by side, and `layoutRows` is the whole of that feature.
 *
 * Panels arrive as already-rendered nodes from the server page, keyed by id. A panel
 * with no node is skipped everywhere — in the page, in the reorder list and in the
 * tray — which is what lets the three charts keep their place in the stored layout
 * before anyone has built them.
 *
 * Arrangement is saved to Postgres, not to browser storage, so it follows you from
 * laptop to phone. Saves are debounced because a drag fires a reorder per frame.
 *
 * Read mode adds no chrome of its own. Panels sit on the ground separated by
 * whitespace; the only thing this file decides is the rhythm between them and, at
 * md and up, whether two half-width panels share a row. Edit mode is the opposite:
 * it is the one place that draws a box, because a dashed outline is how you see the
 * thing you are about to move.
 *
 * Touch is a first-class input here. Reordering by drag with a 28px handle is not
 * usable on a phone, so every control in edit mode is a 44px target, and the two
 * chevrons move a panel without dragging at all — which is also the only way a
 * keyboard can reorder, since a pointer drag has no keyboard equivalent.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Reorder, motion, useDragControls, useReducedMotion } from 'motion/react';

import { useCareerChrome } from './CareerChrome';
import {
  DEFAULT_LAYOUT,
  HALF_WIDTH_CAPABLE,
  PANEL_TITLES,
  layoutRows,
  reorderPanels,
  setPanelHalfWidth,
  setPanelHidden,
  type DashboardLayout,
  type PanelId,
} from './layout';

const SAVE_DEBOUNCE_MS = 450;

/**
 * Every control in edit mode is the same 44px square. `TAP` carries only the box;
 * the two variants below add their own border and fill, rather than one overriding
 * the other — Tailwind resolves a `border-rule border-transparent` pair by source
 * order in the stylesheet, not by the order they appear in the className.
 */
const TAP =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors';
const ICON_BUTTON = `${TAP} border border-rule bg-surface text-ink-muted hover:border-rule-strong hover:text-ink disabled:pointer-events-none disabled:opacity-35`;
const GRIP_BUTTON = `${TAP} cursor-grab touch-none text-ink-muted hover:text-ink active:cursor-grabbing`;

/**
 * Controls inside the inverted tray, which stands on `ink` instead of `ground`.
 *
 * No `/opacity` modifiers anywhere on a theme token: the tokens resolve to
 * `var(--x)`, and Tailwind v3 cannot inject an alpha channel into a value it
 * cannot parse, so `text-ground/75` compiles to nothing at all rather than to a
 * translucent colour. Muted text on the tray therefore uses the plain `opacity`
 * utility, and its borders use `ink-faint`, which reads as a quiet grey against
 * `ink` in every theme because both ends of the ramp move together.
 */
const TRAY_BUTTON =
  'flex min-h-[44px] shrink-0 items-center gap-2 rounded-md border border-ink-faint px-3 text-[13px] text-ground transition-colors hover:bg-ink-muted sm:h-9 sm:min-h-0';

function Grip() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden className="shrink-0">
      {[0, 1, 2, 3].map((row) =>
        [0, 1].map((col) => (
          <circle
            key={`${row}-${col}`}
            cx={2 + col * 6}
            cy={2 + row * 4}
            r="1.2"
            fill="currentColor"
          />
        )),
      )}
    </svg>
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={up ? 'M3.5 10 8 5.5 12.5 10' : 'M3.5 6 8 10.5 12.5 6'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1 8s2.6-4.2 7-4.2S15 8 15 8s-2.6 4.2-7 4.2S1 8 1 8Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      {hidden ? <path d="M2 14 14 2" stroke="currentColor" strokeWidth="1.2" /> : null}
    </svg>
  );
}

function EditRow({
  id,
  title,
  halfWidth,
  position,
  count,
  onHide,
  onHalfWidth,
  onMove,
  reduceMotion,
  children,
}: {
  id: PanelId;
  title: string;
  halfWidth: boolean;
  /** 1-based, for the screen reader: "Move Timeline up (2 of 7)". */
  position: number;
  count: number;
  onHide: () => void;
  onHalfWidth: (value: boolean) => void;
  onMove: (delta: -1 | 1) => void;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      whileDrag={
        reduceMotion
          ? undefined
          : { scale: 1.005, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.16)', zIndex: 2 }
      }
      className="overflow-hidden rounded-lg border border-dashed border-rule-strong bg-surface-2"
    >
      <div className="flex items-center gap-1 border-b border-dashed border-rule px-1.5 py-1.5">
        <button
          type="button"
          onPointerDown={(event) => controls.start(event)}
          aria-label={`Drag to reorder ${title}`}
          className={GRIP_BUTTON}
        >
          <Grip />
        </button>

        <span className="type-condensed min-w-0 flex-1 truncate text-[13px] text-ink">{title}</span>

        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={position === 1}
          aria-label={`Move ${title} up, position ${position} of ${count}`}
          className={ICON_BUTTON}
        >
          <Chevron up />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={position === count}
          aria-label={`Move ${title} down, position ${position} of ${count}`}
          className={ICON_BUTTON}
        >
          <Chevron up={false} />
        </button>

        {/* Pairing only exists from md up, so the control that sets it does too. */}
        {HALF_WIDTH_CAPABLE.has(id) ? (
          <button
            type="button"
            onClick={() => onHalfWidth(!halfWidth)}
            aria-pressed={halfWidth}
            className={`hidden h-11 shrink-0 items-center rounded-md border px-3 text-[12.5px] transition-colors md:flex ${
              halfWidth
                ? 'border-signal bg-signal text-ink-on-signal'
                : 'border-rule bg-surface text-ink-muted hover:border-rule-strong hover:text-ink'
            }`}
          >
            Half width
          </button>
        ) : null}

        <button type="button" onClick={onHide} aria-label={`Hide ${title}`} className={ICON_BUTTON}>
          <EyeIcon hidden={false} />
        </button>
      </div>

      {/* Everything else on the page goes quiet while you arrange it. */}
      <div className="pointer-events-none select-none px-1.5 py-1.5 opacity-55">{children}</div>
    </Reorder.Item>
  );
}

export default function PanelHost({
  initialLayout,
  panels,
}: {
  initialLayout: DashboardLayout;
  panels: Partial<Record<PanelId, ReactNode>>;
}) {
  const chrome = useCareerChrome();
  const editMode = chrome?.editMode ?? false;
  const reduceMotion = useReducedMotion() ?? false;

  const [layout, setLayout] = useState(initialLayout);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<DashboardLayout | null>(null);

  // The server is the source of truth: a refresh after a save, or a load on another
  // device, replaces whatever this tab was holding.
  useEffect(() => setLayout(initialLayout), [initialLayout]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const renderable = useCallback((id: PanelId) => panels[id] != null, [panels]);

  const persist = useCallback(
    (next: DashboardLayout) => {
      setLayout(next);
      pending.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const body = pending.current;
        pending.current = null;
        if (!body) return;
        void (async () => {
          try {
            const response = await fetch('/api/career/layout', {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ layout: body }),
            });
            if (!response.ok) throw new Error(String(response.status));
          } catch {
            // The arrangement still applies in this tab; it just will not follow
            // you to the next device. Worth one quiet line, not a blocking dialog.
            chrome?.notify('The layout did not save. It will not follow to another device.');
          }
        })();
      }, SAVE_DEBOUNCE_MS);
    },
    [chrome],
  );

  const visibleIds = useMemo(
    () => layout.panels.filter((p) => !p.hidden && renderable(p.id)).map((p) => p.id),
    [layout, renderable],
  );

  const hiddenPanels = useMemo(
    () => layout.panels.filter((p) => p.hidden && renderable(p.id)),
    [layout, renderable],
  );

  const onReorder = useCallback(
    (ids: PanelId[]) => {
      // Hidden panels are not in this list; `reorderPanels` keeps them where they
      // were. Computed outside the state updater on purpose — `persist` fetches,
      // and React is free to run an updater twice.
      persist(reorderPanels(layout, ids));
    },
    [layout, persist],
  );

  /** The chevrons: the same reorder a drag performs, one step at a time. */
  const moveBy = useCallback(
    (id: PanelId, delta: -1 | 1) => {
      const from = visibleIds.indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= visibleIds.length) return;
      const next = [...visibleIds];
      next.splice(to, 0, next.splice(from, 1)[0]);
      onReorder(next);
    },
    [visibleIds, onReorder],
  );

  /* ------------------------------------------------------------ read mode */

  if (!editMode) {
    const rows = layoutRows(layout, renderable);
    return (
      <div className="flex flex-col gap-9 sm:gap-12">
        {rows.map((row) => {
          const key = row.map((p) => p.id).join('+');
          if (row.length === 2) {
            // Pairing is a desktop affordance. A phone stacks, always.
            return (
              <div key={key} className="grid grid-cols-1 items-start gap-9 md:grid-cols-2 md:gap-6">
                {row.map((panel) => (
                  <div key={panel.id}>{panels[panel.id]}</div>
                ))}
              </div>
            );
          }
          return <div key={key}>{panels[row[0].id]}</div>;
        })}
      </div>
    );
  }

  /* ------------------------------------------------------------ edit mode */

  return (
    <>
      <Reorder.Group
        axis="y"
        values={visibleIds}
        onReorder={onReorder}
        className="flex list-none flex-col gap-4 p-0"
      >
        {visibleIds.map((id, index) => {
          const panel = layout.panels.find((p) => p.id === id);
          return (
            <EditRow
              key={id}
              id={id}
              title={PANEL_TITLES[id]}
              halfWidth={panel?.halfWidth ?? false}
              position={index + 1}
              count={visibleIds.length}
              reduceMotion={reduceMotion}
              onHide={() => persist(setPanelHidden(layout, id, true))}
              onHalfWidth={(value) => persist(setPanelHalfWidth(layout, id, value))}
              onMove={(delta) => moveBy(id, delta)}
            >
              {panels[id]}
            </EditRow>
          );
        })}
      </Reorder.Group>

      {/* Spacer so the tray never covers the last panel. Taller on a phone, where
          the tray wraps to two rows. */}
      <div className="h-44 sm:h-32" />

      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-faint bg-ink px-4 pt-3 text-ground sm:inset-x-6 sm:bottom-6 sm:rounded-xl sm:border lg:inset-x-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <div className="flex items-center gap-3">
          <span className="type-display text-[14px]">Edit layout</span>
          <span className="hidden text-[12.5px] opacity-75 lg:inline">
            Drag a panel or use the chevrons to reorder it; the eye hides it.
          </span>

          <span className="flex-grow" />

          <button type="button" onClick={() => persist(DEFAULT_LAYOUT)} className={TRAY_BUTTON}>
            Reset
          </button>
          <button
            type="button"
            onClick={() => chrome?.setEditMode(false)}
            className="flex min-h-[44px] shrink-0 items-center rounded-md bg-ground px-4 text-[13px] font-medium text-ink sm:h-9 sm:min-h-0"
          >
            Done
          </button>
        </div>

        {/* The tray. Hidden panels wait here, and scroll sideways on a phone rather
            than pushing the Done button off the screen. */}
        <div className="-mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0">
          {hiddenPanels.length > 0 ? (
            <>
              <span className="shrink-0 text-[12.5px] opacity-75">Hidden</span>
              {hiddenPanels.map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => persist(setPanelHidden(layout, panel.id, false))}
                  className={TRAY_BUTTON}
                >
                  <EyeIcon hidden />
                  {PANEL_TITLES[panel.id]}
                </button>
              ))}
            </>
          ) : (
            <span className="text-[12.5px] opacity-75">Nothing hidden</span>
          )}
        </div>
      </motion.div>
    </>
  );
}
