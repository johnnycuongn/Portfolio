'use client';

import { ASK } from '@/app/PORTFOLIO';
import type { AskTurn } from '@/utils/askStorage';

/** How many past exchanges stay readable; older ones have left the stage. */
const VISIBLE = 4;

/**
 * The conversation's wake: each settled exchange as one quiet line, oldest
 * dimmest. Review only — the slide itself always shows the latest answer.
 */
export default function HistoryTrail({ turns }: { turns: AskTurn[] }) {
  if (turns.length === 0) return null;
  const visible = turns.slice(-VISIBLE);

  return (
    <div className="px-8 pt-16 md:px-24" aria-label={ASK.historyLabel}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">{ASK.historyLabel}</p>
      <ul className="mt-1 space-y-0.5">
        {visible.map((turn, index) => (
          <li
            key={turn.id}
            className="truncate text-xs text-gray-500"
            style={{ opacity: 0.35 + (0.65 * (index + 1)) / visible.length }}
          >
            {turn.recap ?? turn.question}
          </li>
        ))}
      </ul>
    </div>
  );
}
