/**
 * /career/admin/table — the same master table, editable.
 *
 * The gate here is cosmetic and known to be: it decides what to draw, nothing
 * more. Every mutation the cells fire goes through an API route that calls
 * `adminOnly()` for itself, because that is the boundary that actually holds.
 */

import type { Metadata } from 'next';

import { EditableMasterTable } from '@/app/career/_components/MasterTable/EditableCell';
import { loadDashboard } from '@/app/career/_queries';
import TopBar from '@/app/career/_components/TopBar';
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
    <>
      <TopBar />
      <main className={shell}>
      {load.ok ? (
        // The same `MasterTable` the public tree renders, with a slot filled per
        // editable cell (see `TableEditors` in Table.tsx) and an undo toast under
        // it. `/career/table` imports the table directly and passes no slots, so
        // it keeps no mutation code at all.
        <EditableMasterTable data={load.data} today={load.data.today} />
      ) : (
        <p className="rounded-[10px] border border-rule-strong bg-surface px-5 py-8 text-center text-[13px] text-ink-faint">
          The table is not connected to its database yet.
        </p>
      )}
      </main>
    </>
  );
}
