/**
 * /career/admin/table — the same master table, editable.
 *
 * The gate here is cosmetic and known to be: it decides what to draw, nothing
 * more. Every mutation the cells fire goes through an API route that calls
 * `adminOnly()` for itself, because that is the boundary that actually holds.
 */

import type { Metadata } from 'next';

import MasterTable from '@/app/career/_components/MasterTable/Table';
import { loadDashboard } from '@/app/career/_queries';
import { requireAdmin } from '@/lib/career/auth';

import CodeGate from '../_components/CodeGate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Master table — Career admin',
  robots: { index: false, follow: false },
};

export default async function AdminTablePage() {
  const shell = 'bg-ground px-4 py-6 text-ink sm:px-10 sm:py-[26px]';

  if (!(await requireAdmin())) {
    return (
      <main className={shell}>
        <CodeGate />
      </main>
    );
  }

  const load = await loadDashboard();

  return (
    <main className={shell}>
      {load.ok ? (
        // `editors` is the seam for the inline-edit half of this screen: pass a
        // slot per cell (see `TableEditors` in Table.tsx) and that cell becomes
        // editable in place. Absent, every cell renders read-only.
        <MasterTable data={load.data} editable today={load.data.today} />
      ) : (
        <p className="rounded-[10px] border border-rule-strong bg-surface px-5 py-8 text-center text-[13px] text-ink-faint">
          The table is not connected to its database yet.
        </p>
      )}
    </main>
  );
}
