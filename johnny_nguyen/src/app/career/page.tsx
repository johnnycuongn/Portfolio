/**
 * `/career` — the public dashboard. No code required, read-only, noindex.
 *
 * Same component as the admin tree, `editable={false}`. Read-only here is not a
 * styling decision: this page never renders a mutation control, and the API routes
 * behind those controls each call `adminOnly()` regardless, which is where the
 * boundary actually is.
 */

import Dashboard from './_components/PanelLayout/Dashboard';

// Reads the database and the session cookie on every request. There is nothing to
// prerender: a stale dashboard is worse than a slow one.
export const dynamic = 'force-dynamic';

export default function CareerDashboardPage() {
  return <Dashboard editable={false} />;
}
