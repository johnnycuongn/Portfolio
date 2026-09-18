'use client';

/**
 * Zone C — Recently completed. The last 30 days of reached milestones and wins.
 *
 * This is deliberately the visually richest zone on the page and the one place with
 * real colour: a raised surface, larger type, evidence thumbnails, and a signal rule
 * down the left edge of every entry. It exists for morale as much as for
 * record-keeping — on a week when nothing feels like it is moving, you scroll and see
 * nine things you actually did.
 *
 * The colour is carried by rules and fills rather than by coloured text, which is
 * what lets it stay this warm and still clear 4.5:1 in all six themes.
 *
 * Which is also why the colour rule holds so strictly everywhere else. If nothing
 * incomplete is ever coloured, then a good quarter literally colours the page in,
 * and you did that by finishing things.
 *
 * A client component only for the arrival animation, which is the payoff for
 * finishing something: it plays once, for the entry that just appeared, and then it
 * is over. Nothing accumulates. In the riso theme the title also separates into its
 * two inks for a beat — the `riso-register` class is a no-op in the other five
 * themes.
 *
 * What it deliberately does *not* do is replay on load. The rows you are looking at
 * were already there; re-dealing them every time the page opens is a loading
 * sequence pretending to be a reward. Only a key that was not in the list a moment
 * ago animates — which in practice means the thing you just ticked — and only when
 * the reader has not asked for less motion.
 */

import { useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';

import type { RecentVM } from './derive';
import { Empty, Surface, ZoneHeading } from './ui';

const ENTRY_CLASS =
  // The colour lives on the left rule and the thumbnail tile rather than in the
  // text. Same warmth, and it survives riso, where the signal is a fluorescent ink
  // that no small text should sit in.
  'flex items-start gap-3.5 border-l-[3px] border-signal bg-surface px-4 py-4 sm:px-5';

/**
 * One entry. Plain `<article>` unless it genuinely just arrived — motion writes
 * inline transforms, so the reduced-motion branch has to skip the component
 * entirely rather than lean on a CSS override that cannot reach them.
 */
function Entry({ arrived, children }: { arrived: boolean; children: ReactNode }) {
  const reduceMotion = useReducedMotion() ?? false;

  if (!arrived || reduceMotion) return <article className={ENTRY_CLASS}>{children}</article>;

  return (
    <motion.article
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.7, 0.3, 1] }}
      className={ENTRY_CLASS}
    >
      {children}
    </motion.article>
  );
}

export default function RecentlyCompleted({
  entries,
  base,
}: {
  entries: RecentVM[];
  /** `/career` or `/career/admin`. */
  base: string;
}) {
  // Everything present on the first render counts as already seen: the page has
  // just opened and nothing here is news. After that, a key we have not recorded
  // is a genuine arrival — you finished something and the list grew under you.
  //
  // The arrival flag is sticky for as long as the row stays mounted, so a re-render
  // landing mid-flourish cannot swap the element back and cut the animation short.
  const seen = useRef<Set<string> | null>(null);
  const arrivals = useRef<Set<string>>(new Set());
  if (seen.current === null) {
    seen.current = new Set(entries.map((entry) => entry.key));
  } else {
    for (const entry of entries) {
      if (seen.current.has(entry.key)) continue;
      seen.current.add(entry.key);
      arrivals.current.add(entry.key);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <ZoneHeading
        title="Recently completed"
        aside={
          <Link
            href={`${base}/achievements`}
            // A 44px target that costs the heading row nothing: the hit area is
            // full height, the negative margin hands the extra back to the layout.
            className="-my-3 inline-flex h-11 items-center text-ink underline decoration-signal decoration-1 underline-offset-4"
          >
            All achievements
          </Link>
        }
      />

      {entries.length === 0 ? (
        <Empty>Nothing reached in the last 30 days. It will fill up.</Empty>
      ) : (
        <Surface className="overflow-hidden">
          {/* A 1px gap over a ruled ground: hairlines between entries on both axes
              once the grid goes to two columns, with no per-edge border logic. */}
          <div className="grid gap-px bg-rule xl:grid-cols-2">
            {entries.map((entry) => (
              <Entry key={entry.key} arrived={arrivals.current.has(entry.key)}>
                <div
                  className={`type-condensed flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-md px-1 text-center text-[11px] leading-tight ${
                    entry.kind === 'Win'
                      ? 'bg-signal-soft text-ink'
                      : 'bg-surface-2 text-ink-muted'
                  }`}
                >
                  {entry.thumb}
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-condensed text-[11.5px] text-ink-muted">
                      {entry.dateLabel}
                    </span>
                    {entry.competency ? (
                      <span className="rounded-[3px] bg-surface-2 px-1.5 py-[2px] text-[10.5px] text-ink-muted">
                        {entry.competency}
                      </span>
                    ) : null}
                    <span className="text-[10.5px] text-ink-muted">{entry.kind}</span>
                  </div>

                  {entry.goalId ? (
                    <Link
                      href={`${base}/goal/${entry.goalId}`}
                      className="riso-register text-[15.5px] leading-[1.3] tracking-[-0.005em] text-ink decoration-signal decoration-1 underline-offset-2 hover:underline sm:text-[16.5px]"
                    >
                      {entry.title}
                    </Link>
                  ) : (
                    <div className="riso-register text-[15.5px] leading-[1.3] tracking-[-0.005em] text-ink sm:text-[16.5px]">
                      {entry.title}
                    </div>
                  )}

                  {entry.note ? (
                    <div className="text-[12.5px] leading-[1.45] text-ink-muted">{entry.note}</div>
                  ) : null}

                  {entry.evidenceUrl ? (
                    <a
                      href={entry.evidenceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex min-h-[36px] w-fit items-center text-[12.5px] text-ink underline decoration-signal decoration-1 underline-offset-4"
                    >
                      Evidence
                    </a>
                  ) : null}
                </div>
              </Entry>
            ))}
          </div>
        </Surface>
      )}
    </section>
  );
}
