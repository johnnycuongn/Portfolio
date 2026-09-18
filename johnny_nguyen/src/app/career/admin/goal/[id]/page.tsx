import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/lib/career/auth';
import CodeGate from '../../_components/CodeGate';
import { GoalDetailScreen, loadGoalDetail } from '../../../_components/GoalDetail/Header';

/**
 * Goal detail, editable. The same screen as `/career/goal/[id]` with `editable`
 * flipped — never a second copy of the components.
 *
 * The gate here is cosmetic, exactly like every other admin screen: it decides what
 * to render, nothing more. The real boundary is `adminOnly()` inside each mutating
 * API route, which runs whether or not this check was ever reached.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Goal — Ledger',
  robots: { index: false, follow: false },
};

export default async function AdminGoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await requireAdmin())) return <CodeGate />;

  const { id } = await params;
  const data = await loadGoalDetail(id);
  if (!data) notFound();

  return <GoalDetailScreen data={data} editable basePath="/career/admin" />;
}
