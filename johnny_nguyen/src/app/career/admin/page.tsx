/**
 * `/career/admin` — the same dashboard, editable.
 *
 * One branch: no valid session, show the code gate; valid session, show the
 * dashboard with `editable={true}`. The gate is a courtesy that keeps the editing
 * controls out of the way, not the security boundary — every mutating route calls
 * `adminOnly()` on the server whatever this page decides to render, which is the
 * only reason it is safe for this file to be this short.
 */

import { requireAdmin } from '@/lib/career/auth';

import CodeGate from './_components/CodeGate';
import Dashboard from '../_components/PanelLayout/Dashboard';

export const dynamic = 'force-dynamic';

export default async function CareerAdminDashboardPage() {
  // `CodeGate` calls `router.refresh()` once the cookie is set, which re-runs this
  // and swaps the gate for the dashboard without a full navigation.
  if (!(await requireAdmin())) return <CodeGate />;

  return <Dashboard editable />;
}
