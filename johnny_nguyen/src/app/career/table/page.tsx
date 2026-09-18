/**
 * /career/table — the public, read-only master table.
 *
 * Thin by design: read, render. `loadDashboard` folds a database failure into its
 * return value rather than throwing, so a deploy that lands before Neon is
 * provisioned shows a calm line instead of a stack trace.
 *
 * The same component serves the admin tree with `editable` flipped — there is no
 * second copy of this screen to keep in step.
 */

import type { Metadata } from 'next';

import MasterTable from '@/app/career/_components/MasterTable/Table';
import TopBar from '@/app/career/_components/TopBar';
import { loadDashboard } from '@/app/career/_queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Master table — Career',
  // Belt and braces alongside robots.ts: this is a personal ledger, not content.
  robots: { index: false, follow: false },
};

export default async function CareerTablePage() {
  const load = await loadDashboard();

  return (
    <>
      <TopBar />
      <main className="bg-ground px-4 py-6 text-ink sm:px-10 sm:py-[26px]">
      {load.ok ? (
        // `today` comes from the server so the 21-day Doing marker and the
        // "This quarter" preset cannot disagree between render and hydration.
        <MasterTable data={load.data} editable={false} today={load.data.today} />
      ) : (
        <p className="rounded-[10px] border border-rule-strong bg-surface px-5 py-8 text-center text-[13px] text-ink-faint">
          The table is not connected to its database yet.
        </p>
      )}
      </main>
    </>
  );
}
