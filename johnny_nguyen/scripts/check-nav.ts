/**
 * Every career screen must ship a loading boundary.
 *
 * Not a style rule — a latency one. Each career page is `force-dynamic`, and for a
 * dynamic route Next prefetches a `<Link>` only as far as the nearest `loading.tsx`.
 * With no boundary there is nothing to prefetch and nothing to commit early, so the
 * router holds the *old* screen on screen for the whole server render — measured at
 * ~450ms above the network floor on production — with no feedback that the click
 * registered. Adding the boundary is what turns a tab switch into an instant swap.
 *
 * The second assertion is the one that is easy to regress: `TopBar` is rendered by
 * each page rather than by `career/layout.tsx` (see that file's header for why), so
 * a boundary that forgets it blanks the navigation on every click — trading a slow
 * switch for a flickering one. No database, no framework: run via `npm run check`.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = join(process.cwd(), 'src', 'app');
const CAREER = join(APP, 'career');

/** Every directory under `src/app/career` that renders a page. */
function routeDirs(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) continue;
    // `_components`, `_queries` and friends are not routes.
    if (entry.startsWith('_')) continue;
    found.push(...routeDirs(path));
  }
  if (readdirSync(dir).includes('page.tsx')) found.push(dir);
  return found;
}

const routes = routeDirs(CAREER).sort();

assert.ok(
  routes.length >= 8,
  `expected at least 8 career routes (4 public + 4 admin), found ${routes.length}`,
);

for (const dir of routes) {
  const where = relative(process.cwd(), dir);
  const files = readdirSync(dir);

  assert.ok(
    files.includes('loading.tsx'),
    `${where} renders a page but has no loading.tsx — a tab click into it will freeze ` +
      `the previous screen for the whole server render`,
  );

  const source = readFileSync(join(dir, 'loading.tsx'), 'utf8');
  assert.match(
    source,
    /<TopBar\s*\/>/,
    `${where}/loading.tsx does not render <TopBar /> — the navigation would disappear ` +
      `while the screen loads, because TopBar lives in the pages, not the layout`,
  );
}

console.log(`check-nav: ${routes.length} career routes, all with a loading boundary that keeps the nav`);
