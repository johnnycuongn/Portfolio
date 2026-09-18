/**
 * /career/achievements — the public, read-only achievements screen.
 *
 * Thin by design: read, hand the rows to the provider, render. The admin tree
 * renders the identical tree with `editable` flipped, so there is no second copy
 * of this screen to keep in step.
 *
 * This is also the screen the whole app is for. The forward half plans learning;
 * this half is the permanent, dated record you put in front of a manager — which
 * is why the public tree renders it in full rather than behind the gate.
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
import TopBar from '@/app/career/_components/TopBar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Achievements — Career',
  // Belt and braces alongside robots.ts: this is a personal ledger, not content.
  robots: { index: false, follow: false },
};

const SHELL = 'bg-ground px-4 py-6 text-ink sm:px-10 sm:py-[26px]';

export default async function CareerAchievementsPage() {
  const load = await loadDashboard();

  if (!load.ok) {
    return (
      <>
        <TopBar />
        <main className={SHELL}>
        <p className="rounded-[10px] border border-rule-strong bg-surface px-5 py-8 text-center text-[13px] text-ink-faint">
          The achievement log is not connected to its database yet.
        </p>
        </main>
      </>
    );
  }

  const { competencies, goals, milestones, wins, today } = load.data;

  return (
    <>
      <TopBar />
      <main className={SHELL}>
      {/* `today` comes from the server so the 90-day window cannot be computed
          differently on a phone in another timezone than it was on render. */}
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

          <AchievementTimeline editable={false} />
        </div>
      </AchievementsProvider>
      </main>
    </>
  );
}
