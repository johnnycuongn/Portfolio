/**
 * /career/admin/achievements — the same achievements screen, editable.
 *
 * The gate here is cosmetic and known to be: it decides what to draw, nothing
 * more. Every mutation this screen can fire goes through an API route that calls
 * `adminOnly()` for itself, because that is the boundary that actually holds.
 *
 * The only difference from the public page is the `editable` flag, which repoints
 * the log's goal links at the admin tree and opens the per-row action seam.
 */

import type { Metadata } from 'next';

import CompetencyBalance, {
  CompetencySpine,
} from '@/app/career/_components/Achievements/CompetencyBalance';
import AchievementTimeline, {
  AchievementsProvider,
  AchievementsSummary,
} from '@/app/career/_components/Achievements/Timeline';
import { loadDashboard } from '@/app/career/_queries';
import { requireAdmin } from '@/lib/career/auth';

import CodeGate from '../_components/CodeGate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Achievements — Career admin',
  robots: { index: false, follow: false },
};

const SHELL = 'bg-ground px-4 py-6 text-ink sm:px-10 sm:py-[26px]';

export default async function AdminAchievementsPage() {
  if (!(await requireAdmin())) {
    return (
      <main className={SHELL}>
        <CodeGate />
      </main>
    );
  }

  const load = await loadDashboard();

  if (!load.ok) {
    return (
      <main className={SHELL}>
        <p className="rounded-[10px] border border-rule-strong bg-surface px-5 py-8 text-center text-[13px] text-ink-faint">
          The achievement log is not connected to its database yet.
        </p>
      </main>
    );
  }

  const { competencies, goals, milestones, wins, today } = load.data;

  return (
    <main className={SHELL}>
      <AchievementsProvider source={{ competencies, goals, milestones, wins, today }}>
        <div className="flex flex-col gap-[22px]">
          <header className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-[5px]">
              <h1 className="type-display text-[24px] sm:text-[28px]">
                Achievements
              </h1>
              <p className="text-[13px] text-ink-muted">
                Dated, evidenced, and grouped the way a promotion conversation goes. Nothing here is
                ever removed.
              </p>
            </div>
            <AchievementsSummary />
          </header>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]">
            <CompetencyBalance />
            <CompetencySpine />
          </div>

          <AchievementTimeline editable />
        </div>
      </AchievementsProvider>
    </main>
  );
}
