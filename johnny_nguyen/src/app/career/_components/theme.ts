/**
 * The theme registry.
 *
 * Every theme is the same two decisions — a neutral ramp and one signal colour —
 * because the spec's rule is that colour marks what you have done, never what
 * you owe. A theme that wanted a second accent would have nothing legitimate to
 * spend it on.
 *
 * Values live in `theme.css`; this file is only the list, shared between the
 * pre-paint bootstrap script in the layout and the switcher in the top bar.
 */

export const THEME_STORAGE_KEY = 'ledger-theme';

export type ThemeId = 'graphite' | 'carbon' | 'sage' | 'harbour' | 'iris' | 'riso';

export const THEME_IDS: ThemeId[] = ['graphite', 'carbon', 'sage', 'harbour', 'iris', 'riso'];

export type ThemeMeta = {
  id: ThemeId;
  name: string;
  /** What it is, in the viewer's terms — not "a cool-neutral light theme". */
  note: string;
  /** Ground and signal, for the swatch. Mirrors theme.css; only the swatch reads it. */
  swatch: { ground: string; signal: string; signal2?: string };
};

export const THEMES: ThemeMeta[] = [
  {
    id: 'graphite',
    name: 'Graphite',
    note: 'Cool grey, blueprint blue',
    swatch: { ground: '#fafafb', signal: '#2d4ecc' },
  },
  {
    id: 'carbon',
    name: 'Carbon',
    note: 'Dark',
    swatch: { ground: '#0f1013', signal: '#5b7cff' },
  },
  {
    id: 'sage',
    name: 'Sage',
    note: 'Warm grey, green',
    swatch: { ground: '#f7f8f5', signal: '#2f7d5b' },
  },
  {
    id: 'harbour',
    name: 'Harbour',
    note: 'Blue-grey, deep teal',
    swatch: { ground: '#f5f7f9', signal: '#1c6b72' },
  },
  {
    id: 'iris',
    name: 'Iris',
    note: 'Pale lilac, violet',
    swatch: { ground: '#f8f7fa', signal: '#5b4bc4' },
  },
  {
    id: 'riso',
    name: 'Riso',
    note: 'Two fluorescent inks',
    swatch: { ground: '#fbf9f3', signal: '#ff4d8d', signal2: '#0a5fff' },
  },
];

/** Total: anything unrecognised resolves to the default rather than throwing. */
export function coerceTheme(value: unknown): ThemeId {
  return THEME_IDS.includes(value as ThemeId) ? (value as ThemeId) : 'graphite';
}

export function readStoredTheme(): ThemeId | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_IDS.includes(raw as ThemeId) ? (raw as ThemeId) : null;
  } catch {
    // Private windows and blocked site data both throw here. A theme is a
    // convenience; losing it must never stop the page rendering.
    return null;
  }
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute('data-theme', id);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Same as above — the attribute is already set, so the theme still applies
    // for this visit even when it cannot be remembered for the next one.
  }
}

/** What the bootstrap script picked when nothing was stored. */
export function systemTheme(): ThemeId {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'carbon' : 'graphite';
  } catch {
    return 'graphite';
  }
}
