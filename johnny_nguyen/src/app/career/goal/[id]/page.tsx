import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { GoalDetailScreen, loadGoalDetail } from '../../_components/GoalDetail/Header';

/**
 * Goal detail, public and read-only.
 *
 * Thin by design: this file and its admin twin differ only in the `editable` flag
 * and the base path every link is built from. The screen itself is one component,
 * never forked into a read-only copy and an editable copy.
 */

// Reads the database on every request, and must not be evaluated at build time —
// Vercel builds the project before Neon is necessarily reachable.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Goal — Ledger',
  // Belt and braces with robots.ts: this is a personal career ledger, not content.
  robots: { index: false, follow: false },
};

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadGoalDetail(id);
  if (!data) notFound();

  return <GoalDetailScreen data={data} editable={false} basePath="/career" />;
}
