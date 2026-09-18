/**
 * The dashboard, whole. One component, rendered by both `/career` and
 * `/career/admin` with `editable` flipped — never forked into a read-only copy and
 * an editable one, because the day those two diverge is the day the public view
 * stops being the thing you can actually screen-share.
 *
 * A server component: it reads, derives every zone's view-model, and hands small
 * plain objects to the client pieces. The whole task table never reaches the
 * browser, and the server's idea of "today" is the only one in play.
 */

import type { ReactNode } from 'react';

import { parseIsoDate, startOfUtcDay } from '@/lib/career/horizon';
import { goalSummary, type GoalSummary } from '@/lib/career/rollup';

import Timeline from '../Timeline';
import Heatmap from '../Heatmap';
import CompletionTrend from '../Achievements/CompletionTrend';
import QuarterBurnup from '../Achievements/QuarterBurnup';

import TopBar from '../TopBar';
import SummaryStrip from '../SummaryStrip';
import DoingNow from '../Zones/DoingNow';
import UpNext from '../Zones/UpNext';
import RecentlyCompleted from '../Zones/RecentlyCompleted';
import Backlog from '../Zones/Backlog';
import {
  activeGoalCards,
  backlog as deriveBacklog,
  doingTasks,
  inFlightNote,
  recentlyCompleted,
  summarise,
  upNextTasks,
} from '../Zones/derive';
import { loadDashboard } from '../../_queries';
import PanelHost from './PanelHost';
import type { PanelId } from './layout';

/**
 * The one screen state that is not an empty state: the database is not reachable.
 * It says so plainly and names nothing secret — the message is the error's own,
 * which names the missing variable and never a value.
 */
function NotConnected({ reason }: { reason: string }) {
  return (
    <div className="rounded-lg border border-rule bg-surface px-5 py-9 sm:px-7 sm:py-10">
      <h1 className="type-display text-[22px] text-ink sm:text-[26px]">
        The ledger is not connected yet
      </h1>
      <p className="mt-2.5 max-w-[62ch] text-[14px] leading-relaxed text-ink-muted">{reason}</p>
    </div>
  );
}

export default async function Dashboard({ editable }: { editable: boolean }) {
  const base = editable ? '/career/admin' : '/career';
  const load = await loadDashboard();

  if (!load.ok) {
    return (
      <>
        <TopBar />
        <div className="px-4 pb-16 pt-6 sm:px-8 sm:pt-8 lg:px-10">
          <NotConnected reason={load.reason} />
        </div>
      </>
    );
  }

  const { data } = load;
  const rows = {
    competencies: data.competencies,
    goals: data.goals,
    milestones: data.milestones,
    tasks: data.tasks,
    wins: data.wins,
  };
  const today = parseIsoDate(data.today) ?? startOfUtcDay(new Date());

  // Rollups computed once and shared with the timeline, so a goal's percentage on
  // its bar and on its card cannot disagree. That kind of drift is the fastest way
  // to stop trusting a dashboard.
  const summaries: Record<string, GoalSummary> = {};
  for (const goal of data.goals) {
    summaries[goal.id] = goalSummary(
      goal,
      data.goals,
      data.milestones,
      data.tasks,
      today,
    );
  }

  const cards = activeGoalCards(rows, data.today);
  const inFlight = doingTasks(rows, data.today);

  const panels: Partial<Record<PanelId, ReactNode>> = {
    summary: <SummaryStrip summary={summarise(rows, data.today)} />,

    timeline: (
      <Timeline
        goals={data.goals}
        milestones={data.milestones}
        tasks={data.tasks}
        today={today}
        editable={editable}
        summaries={summaries}
      />
    ),

    heatmap: (
      <Heatmap
        tasks={data.tasks}
        milestones={data.milestones}
        wins={data.wins}
        goals={data.goals}
        today={today}
        editable={editable}
      />
    ),

    doing: (
      <DoingNow
        cards={cards}
        tasks={inFlight}
        note={inFlightNote(inFlight.length)}
        editable={editable}
        goalBase={base}
      />
    ),

    upnext: <UpNext tasks={upNextTasks(rows)} editable={editable} />,

    recent: <RecentlyCompleted entries={recentlyCompleted(rows, data.today)} base={base} />,

    backlog: <Backlog backlog={deriveBacklog(rows)} editable={editable} goalBase={base} />,

    // The two charts that stand on their own props. Hidden by default — they are
    // natives of the Achievements screen and the spec offers them here as an
    // option, not as part of the default dashboard.
    'completion-trend': <CompletionTrend tasks={data.tasks} today={today} editable={editable} />,
    'quarter-burnup': (
      <QuarterBurnup goals={data.goals} tasks={data.tasks} today={today} editable={editable} />
    ),
    // `competency-balance` has no entry: that component reads the Achievements
    // screen's own context rather than props, so it cannot be mounted here. A panel
    // with no renderer is skipped everywhere and keeps its place in the stored
    // layout, so it will simply appear the day it grows a props API. The summary
    // strip already carries the same signal — the thinnest competency by evidence.
  };

  return (
    <>
      <TopBar />
      {/* 16px gutter on a phone, so nothing inside a panel has to fight for width.
          `overflow-x-clip` is the page-level guarantee the brief asks for: the master
          table and the timeline each scroll inside their own container, and neither
          is allowed to hand a horizontal scrollbar to the document. */}
      <div className="overflow-x-clip px-4 pb-24 pt-6 sm:px-8 sm:pt-8 lg:px-10">
        {/* The document outline has to start somewhere, and every zone below is an
            h2. Deliberately quiet: the timeline is the hero of this screen and the
            readouts are the loud figures — a title competing with either would be
            the third thing shouting. It names the screen and gets out of the way. */}
        <h1 className="type-display mb-4 text-[13px] text-ink-muted sm:mb-5">Dashboard</h1>
        <PanelHost initialLayout={data.layout} panels={panels} />
      </div>
    </>
  );
}
