/**
 * The career dashboard's shell, shared by every screen in both trees.
 *
 * Four jobs and no more:
 *
 *   1. **Its own typeface.** The portfolio loads Geist and paints the page dark
 *      slate; the ledger is a light, dense data app set in Archivo. It is loaded
 *      here and scoped to this subtree rather than added to the root layout,
 *      where it would be downloaded on every visit to the portfolio that will
 *      never use it.
 *   2. **Theming.** Six themes, each of them a neutral ramp plus one signal
 *      colour. The choice is per-viewer and lives in localStorage, not the
 *      database: the read-only tree has no write path, so a visitor reading a
 *      shared link can still pick a theme.
 *   3. **The chrome provider.** Edit-layout mode and the undo toast, so the top
 *      bar and the panels several screens down can talk to each other.
 *   4. **noindex.** The read-only tree is link-shareable, not search-indexable —
 *      the point is a URL you can hand to a manager, not a page Google holds a
 *      copy of. `robots.ts` says the same thing at the crawler level; this is the
 *      header that travels with the page itself.
 *
 * Deliberately no top bar here: `/career/admin` shows the code gate before it
 * shows anything else, and a gate with a navigation bar above it reads like a
 * half-open door. Every screen renders `<TopBar />` itself.
 */

import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';

import { requireAdmin } from '@/lib/career/auth';
import CareerChrome from './_components/PanelLayout/CareerChrome';
import { THEME_IDS, THEME_STORAGE_KEY } from './_components/theme';
import './theme.css';

/**
 * One family for the whole app, with its variable width axis doing the
 * expressive work: expanded for the big readouts, normal for prose, condensed
 * for dense table columns. Width is how you fit tabular data, so the
 * personality is load-bearing rather than decorative — and Archivo's tabular
 * figures remove any need for a second, monospace face just to line up numbers.
 */
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-ledger',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ledger',
  description: 'A career ledger — what I am learning, how far along, and what I have finished.',
  robots: { index: false, follow: false },
};

/**
 * Runs before first paint, so the page never flashes the light theme on its way
 * to the dark one. Inline and synchronous for that reason. It is deliberately
 * total: an unreadable or tampered value falls back to the system preference
 * rather than throwing, and a browser with storage blocked still renders.
 */
const THEME_BOOTSTRAP = `(function(){try{
var v=${JSON.stringify(THEME_IDS)};
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(v.indexOf(t)===-1){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'carbon':'graphite';}
document.documentElement.setAttribute('data-theme',t);
}catch(e){document.documentElement.setAttribute('data-theme','graphite');}})();`;

export default async function CareerLayout({ children }: { children: React.ReactNode }) {
  // Whether a valid admin session exists. It does not by itself mean "editable" —
  // the read-only tree stays read-only whoever is holding the laptop. CareerChrome
  // combines this with the path.
  const isAdmin = await requireAdmin();

  return (
    <div className={`ledger min-h-screen bg-ground text-ink antialiased ${archivo.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      <CareerChrome isAdmin={isAdmin}>{children}</CareerChrome>
    </div>
  );
}
