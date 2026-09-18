/**
 * The dashboard's panel layout — the data half. Pure, no React, no database, so it
 * is safe to import from the API route, a server component and a client component
 * alike.
 *
 * The spec's rules, encoded here so no screen can drift from them:
 *
 *   - Single column, vertical reorder only. No free-form grid, no resizing.
 *   - Two panels may be marked half-width and pair side by side: Up next and
 *     Backlog. Nothing else, ever — a general grid is a week of work and a
 *     permanent source of bugs.
 *   - Hiding is reversible and visible: hidden panels collect in a tray.
 *   - The layout lives in Postgres under `layout/default`, not browser storage,
 *     so the arrangement follows you from laptop to phone.
 *
 * `PANEL_IDS` deliberately names all ten panels the spec lists, including the three
 * charts, even though this screen does not render them yet. The layout is a *data*
 * contract: if the id set shrank to whatever happens to be built today, then the
 * first time someone adds Quarter burn-up every stored layout would silently forget
 * where it sat. A panel with no renderer is simply skipped — see PanelHost.
 */

export const PANEL_IDS = [
  'summary',
  'timeline',
  'heatmap',
  'doing',
  'upnext',
  'recent',
  'backlog',
  'completion-trend',
  'quarter-burnup',
  'competency-balance',
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_TITLES: Record<PanelId, string> = {
  summary: 'Summary strip',
  timeline: 'Timeline',
  heatmap: 'Activity heatmap',
  doing: 'Doing now',
  upnext: 'Up next',
  recent: 'Recently completed',
  backlog: 'Backlog',
  'completion-trend': 'Completion trend',
  'quarter-burnup': 'Quarter burn-up',
  'competency-balance': 'Competency balance',
};

/** The spec's two exceptions, and the whole of them. */
export const HALF_WIDTH_CAPABLE: ReadonlySet<PanelId> = new Set<PanelId>(['upnext', 'backlog']);

export type PanelState = {
  id: PanelId;
  hidden: boolean;
  /** Ignored unless the id is in HALF_WIDTH_CAPABLE, and ignored on mobile. */
  halfWidth: boolean;
};

export const LAYOUT_VERSION = 1 as const;

export type DashboardLayout = {
  version: typeof LAYOUT_VERSION;
  panels: PanelState[];
};

/**
 * Default order: summary, then the two full-width pictures, then the four zones in
 * the spec's order — Doing now, Up next, Recently completed, Backlog. That order
 * runs present, future, past, parked, which is the order you actually think in.
 *
 * The three charts ship hidden. They are natives of the Achievements screen; the
 * spec offers them here as an option, not as the default dashboard.
 */
export const DEFAULT_LAYOUT: DashboardLayout = {
  version: LAYOUT_VERSION,
  panels: [
    { id: 'summary', hidden: false, halfWidth: false },
    { id: 'timeline', hidden: false, halfWidth: false },
    { id: 'heatmap', hidden: false, halfWidth: false },
    { id: 'doing', hidden: false, halfWidth: false },
    { id: 'upnext', hidden: false, halfWidth: false },
    { id: 'recent', hidden: false, halfWidth: false },
    { id: 'backlog', hidden: false, halfWidth: false },
    { id: 'completion-trend', hidden: true, halfWidth: false },
    { id: 'quarter-burnup', hidden: true, halfWidth: false },
    { id: 'competency-balance', hidden: true, halfWidth: false },
  ],
};

export function isPanelId(value: unknown): value is PanelId {
  return typeof value === 'string' && (PANEL_IDS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Turns whatever came back from the `settings` row into a layout that is safe to
 * render.
 *
 * This is the only place stored layout is trusted, so it is total: any shape at all
 * goes in, a complete layout comes out. Unknown ids are dropped (a panel that no
 * longer exists must not leave a hole), duplicates are collapsed, and every known
 * panel missing from the stored order is appended in its default position relative
 * to the others — which is what makes adding a panel later a non-event for anyone
 * who already saved a layout.
 */
export function normalizeLayout(raw: unknown): DashboardLayout {
  const panels: PanelState[] = [];
  const seen = new Set<PanelId>();

  const storedPanels = isRecord(raw) ? raw.panels : undefined;
  if (Array.isArray(storedPanels)) {
    for (const entry of storedPanels) {
      if (!isRecord(entry)) continue;
      const id = entry.id;
      if (!isPanelId(id) || seen.has(id)) continue;
      seen.add(id);
      panels.push({
        id,
        hidden: entry.hidden === true,
        halfWidth: HALF_WIDTH_CAPABLE.has(id) && entry.halfWidth === true,
      });
    }
  }

  for (const panel of DEFAULT_LAYOUT.panels) {
    if (!seen.has(panel.id)) panels.push({ ...panel });
  }

  return { version: LAYOUT_VERSION, panels };
}

/* ------------------------------------------------------------------ operations */

/** A new layout with `id` moved to `index` among the panels. Out-of-range is clamped. */
export function reorderPanels(layout: DashboardLayout, orderedIds: readonly PanelId[]): DashboardLayout {
  const byId = new Map(layout.panels.map((p) => [p.id, p]));
  const panels: PanelState[] = [];
  for (const id of orderedIds) {
    const panel = byId.get(id);
    if (panel && !panels.some((p) => p.id === id)) panels.push(panel);
  }
  // Anything the caller left out keeps its place at the end rather than vanishing.
  for (const panel of layout.panels) {
    if (!panels.some((p) => p.id === panel.id)) panels.push(panel);
  }
  return { version: LAYOUT_VERSION, panels };
}

export function setPanelHidden(
  layout: DashboardLayout,
  id: PanelId,
  hidden: boolean,
): DashboardLayout {
  return {
    version: LAYOUT_VERSION,
    panels: layout.panels.map((p) => (p.id === id ? { ...p, hidden } : p)),
  };
}

export function setPanelHalfWidth(
  layout: DashboardLayout,
  id: PanelId,
  halfWidth: boolean,
): DashboardLayout {
  if (!HALF_WIDTH_CAPABLE.has(id)) return layout;
  return {
    version: LAYOUT_VERSION,
    panels: layout.panels.map((p) => (p.id === id ? { ...p, halfWidth } : p)),
  };
}

/**
 * Visible panels grouped into rows. A row holds two panels only when both are
 * half-width, both are adjacent, and both are actually renderable — otherwise a
 * lone half-width panel would sit in half a page with nothing beside it.
 */
export function layoutRows(
  layout: DashboardLayout,
  renderable: (id: PanelId) => boolean,
): PanelState[][] {
  const visible = layout.panels.filter((p) => !p.hidden && renderable(p.id));
  const rows: PanelState[][] = [];

  for (let i = 0; i < visible.length; i += 1) {
    const panel = visible[i];
    const next = visible[i + 1];
    if (panel.halfWidth && next?.halfWidth) {
      rows.push([panel, next]);
      i += 1;
    } else {
      rows.push([panel]);
    }
  }

  return rows;
}
