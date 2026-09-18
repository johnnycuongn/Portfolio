'use client';

/**
 * Zone B — Up next.
 *
 * Three to five suggested tasks, pulled automatically: the next unfinished task from
 * each active goal that has nothing currently in Doing. One click moves a row from
 * here to Doing.
 *
 * There is no manual queue, and that is the feature. A list you have to curate is
 * another obligation, and an obligation is exactly what this dashboard is built to
 * avoid. If the suggestion is wrong, ignore it — nothing keeps score.
 *
 * Quiet by construction: a heading, a hairline, rows. Nothing here is coloured,
 * because nothing here is done.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';

import { useCareerChrome } from '../PanelLayout/CareerChrome';
import { applyUndo, setTaskStatus } from './mutate';
import type { UpNextVM } from './derive';
import { EffortTag, Empty, ZoneHeading } from './ui';

export default function UpNext({ tasks, editable }: { tasks: UpNextVM[]; editable: boolean }) {
  const router = useRouter();
  const chrome = useCareerChrome();
  // Same reason as the other zones: `layout` is an inline transform, so the guard
  // has to be here rather than in the stylesheet. Rows reflow, they just do not slide.
  const reduceMotion = useReducedMotion() ?? false;
  const [starting, setStarting] = useState<Record<string, boolean>>({});

  const start = useCallback(
    async (task: UpNextVM) => {
      if (starting[task.id]) return;
      setStarting((s) => ({ ...s, [task.id]: true }));

      // The route stamps `started_on` itself — that date has one owner.
      const result = await setTaskStatus(task.id, 'doing');
      if (!result.ok) {
        setStarting((s) => ({ ...s, [task.id]: false }));
        chrome?.notify('That did not save. The task is unchanged.');
        return;
      }
      chrome?.notify(`Started — ${task.title}`, () => {
        void (async () => {
          await applyUndo(result.undo);
          setStarting((s) => ({ ...s, [task.id]: false }));
          router.refresh();
        })();
      });
      router.refresh();
    },
    [chrome, router, starting],
  );

  return (
    <section className="flex h-full flex-col gap-4">
      <ZoneHeading title="Up next" />

      {tasks.length === 0 ? (
        <Empty>Nothing suggested — every active goal already has something in flight.</Empty>
      ) : (
        <div className="flex flex-col">
          {tasks.map((task) => (
            <motion.div
              key={task.id}
              layout={!reduceMotion}
              className="flex items-center gap-3 border-b border-rule py-2 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col gap-[3px]">
                <span className="text-[13.5px] leading-snug text-ink">{task.title}</span>
                <span className="truncate text-[11px] text-ink-muted">{task.goalTitle}</span>
              </div>
              <span className="flex-grow" />
              <EffortTag effort={task.effort} />
              {editable ? (
                <button
                  type="button"
                  onClick={() => void start(task)}
                  disabled={starting[task.id]}
                  className="h-11 shrink-0 rounded-md border border-rule bg-surface px-4 text-[12.5px] text-ink transition-colors hover:bg-surface-2 disabled:opacity-50 sm:h-8 sm:px-3"
                >
                  {starting[task.id] ? 'Starting' : 'Start'}
                </button>
              ) : null}
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
