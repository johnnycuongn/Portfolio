# Career Dashboard — Specification

2026-09-18 · @Someone

## Purpose

A single place to answer four questions without digging: what am I learning right now, how far along am I, what have I actually achieved, and what should I pick up next.

This is a career ledger, not a to-do app. The forward half plans learning; the backward half accumulates permanent, dated evidence of work done. That backward half is what gets shown to a manager in a promotion conversation.

**Design principles**

- **One master table, many views.** Every unit of work is a row in one place. The dashboard, the achievement log and the competency matrix are all filtered views of it, never separate systems to keep in sync.
- **Three levels, no deeper.** Goal → Objective → Milestone. Anything wanting a fourth level means the goal is too big.
- **Nothing is deleted.** Completing a milestone moves it, never removes it. Dropping a goal archives it with a reason.
- **Adding takes under ten seconds.** If capture has friction, the dashboard goes stale in three weeks and the whole thing is dead.
- **No gamification.** No streaks, points or badges. Progress bars and dates only.

## How it should feel

The failure mode for a tool like this is not ugliness, it is pressure. Open it, see forty open items, feel behind, close it, stop opening it. Every decision below exists to prevent that, and they override the feature sections where the two ever disagree.

**Colour marks what you have done, not what you owe.** The page is greys and white by default. The accent colour appears in exactly three places: the filled portion of a progress bar, the heatmap's shaded cells, and completed entries in the log. Nothing incomplete is coloured, nothing overdue is red unless it genuinely has a date and has passed it. The visual result is that a good quarter literally colours the page in, and you did that by finishing things.

**Done is the loud number.** Wherever a count appears, the completed figure is large and the total is small beside it — `23` done with `of 31` in muted text, never "8 remaining". The dashboard never displays a total count of everything open, anywhere. That number is available in the master table for when you actually want it.

**Something all-time and always rising.** The summary strip carries at least one number that can only go up: milestones reached all time, goals completed, evidence items collected. Quarter percentages can look bad in a bad month; these cannot. On a week where everything feels stalled, that line is the honest counter-argument.

**Celebrate the moment, never accumulate an obligation.** This is the whole of the game feel, and the line between fun and pressure runs right here.

| Do | Don't |
| --- | --- |
| Bar fill animates when you tick a task | Points, XP, levels |
| A completed milestone gets a brief flourish and slides into Recently completed | Streaks and streak warnings |
| The number ticks up rather than jumping | Badges and achievement unlocks |
| The heatmap cell darkens as you watch | Anything that emails or notifies you |
| Quarter close shows a short recap of what you finished | Leaderboards or comparisons to a past you |

The distinction: a flourish rewards a thing you did and then it is over. A streak, a level or a badge creates a balance you can fall behind on, which is the pressure this app exists to avoid.

**Friction scales with rarity.** Ticking a task is one click with no confirmation and an undo toast. Starting a task is one click. Quick-add is one keystroke from anywhere. The only places that ask something of you are the rare ones — a why-line when you create a goal, evidence when you reach a milestone — because those happen a few times a month and are the two things that make the whole record worth having.

**Nothing nags.** No notifications, no badges on the tab, no emails, no red dots for things that are merely unfinished. The weekly review is an invitation on the dashboard, not an alert. If you do not open the app for three weeks, it should look exactly the same when you come back, with no catch-up screen and nothing scolding you.

## Core structure

Goal → Milestone → Task, and the middle level is optional. A small goal can hold tasks directly; a big one earns milestones as checkpoints along the way. That optionality is what keeps the structure from feeling like paperwork on a two-week goal.

**Goal** — the thing you are aiming at, phrased as an outcome, not a topic. Not "AI" but "ship a document-analysis LLM tool that a real user runs." A goal carries a **status**, a **why-line**, and an optional **horizon**.

The why-line is one sentence: the reason this goal exists. *Needed for the solution-architect conversation. Keeps me credible on GenAI work in interviews.* When motivation dips, that sentence tells you whether to push or kill the goal. Goals without one rot in the list.

**Horizon is optional and has two parts** — a type and a value. Set a type and the value defaults to the current period, which you can change to any period you like. The target date then derives itself, so it is never a separate field to fill.

| Type | Value | Target date derives as |
| --- | --- | --- |
| None | — | No deadline. Progress still tracked, pace is not. |
| Monthly | `2026-09` | Last day of that month |
| Quarterly | `2026-Q3` | Last day of that quarter |
| Yearly | `2026` | 31 December of that year |
| Custom | explicit start + end dates | The end date you set |

A goal with no horizon is perfectly valid — that is most of the backlog, and plenty of ongoing goals too. Horizon is what you add when you want the goal to appear on the timeline and be judged on pace.

Horizons also nest through an optional **parent goal** link, one level only, so a quarterly goal can roll up into a yearly one.

**Milestone** — a checkpoint worth being proud of, 2–5 per goal where used. "Working vector search running against my own documents." Not a chore, not a topic: something that, when reached, would be worth telling someone about. This is the level that carries **evidence** and the level that feeds the achievement log.

**Task** — the atom. What you actually sit down and do, sized to finish in a week or less. "Compare pgvector against Qdrant for this use case." A task is a checkbox with an effort size, nothing more — no evidence field, no ceremony. Tasks drive the progress bars; they do not appear in the achievement log.

Putting evidence on milestones rather than on every task is what makes this sustainable. You should not have to justify "read the pgvector docs." You should have to justify "vector search is working" — and there, evidence is easy and worth capturing: a repo link, a PR, a diagram, an exam result, a few sentences on what you learned. A milestone cannot be marked done with both evidence fields empty.

The side effect is a much better achievement log. It fills with checkpoints reached, not chores ticked.

**Statuses on goals**

| Status | Meaning | Where it shows |
| --- | --- | --- |
| Active | Being worked now | Dashboard, top zone |
| Paused | Started, deliberately on hold, has a reason | Master table only |
| Backlog | Not started; picked up when capacity frees | Backlog zone |
| Done | Completed, permanent | Achievements |
| Dropped | Abandoned with a reason, kept for honesty | Master table, archived filter |

Certifications need no separate system. A certification is a goal with `kind = certification` sitting in Backlog, with cost, estimated hours and an expiry window filled in. When you have spare capacity you sort the backlog by hours ascending and pull one into Active.

## The competency spine

Five rows, fixed forever. They hold from senior through tech lead, engineering manager and CTO. What changes between levels is the size of the evidence, not the rows themselves — so the dashboard never needs restructuring when you move up.

| Competency | What it measures | Senior | Lead | EM | CTO |
| --- | --- | --- | --- | --- | --- |
| Technical judgment | Quality of the calls you make and the ones you review | Depth in your stack | Design across a team's systems | Reviewing decisions, not making them all | Technology strategy and bets |
| Scope of ownership | How much breaks if you disappear | A service or feature area | A team's roadmap | A group and its headcount | The whole org and its budget |
| People impact | How much better others are because of you | Reviews, unblocking peers | Mentoring, raising the bar | Hiring, performance, growth | Leaders who grow leaders |
| Business impact | Money, users, risk — in the business's own language | Feature outcomes | Team outcomes vs cost | Roadmap tied to revenue | P&L, build-vs-buy, company bets |
| Communication & influence | Getting the right thing to happen without authority | Clear docs and design reviews | Cross-team alignment | Exec and stakeholder management | Board, customers, market |

Every milestone and every win tags exactly one competency. That single tag does all the heavy lifting:

- It reveals neglect. Most engineers finish a year with thirty entries under technical judgment and two under business impact. That gap is the thing that gates every promotion above senior, and the dashboard should make it impossible to miss.
- It turns the achievement log into a promotion packet. Filter the log by competency, and each row becomes an argument with dated evidence underneath it. That is the artefact you take to a manager — not "I learned RAG" but "here is ownership, and here are four dated things I own."

One practical habit the structure should encourage: when logging business impact, write the number. Dollars saved, latency cut, hours of manual work removed, users served. Small numbers now build the instinct you need for the numbers later.

## Data model

Four tables. `competencies` is fixed seed data, so in practice you only ever write to three.

**goals**

| Field | Type | Notes |
| --- | --- | --- |
| id | string |  |
| title | string | Phrased as an outcome |
| why | string | One sentence, required |
| horizon_type | enum | none, monthly, quarterly, yearly, custom |
| horizon_value | string, nullable | `2026-09`, `2026-Q3`, `2026`; null when type is none or custom |
| custom_start | date, nullable | Custom only |
| custom_end | date, nullable | Custom only |
| parent_goal_id | string, nullable | Optional roll-up, one level |
| kind | enum | skill, certification, domain, role, project |
| status | enum | active, paused, backlog, done, dropped |
| competency_id | string | Primary competency this goal builds |
| started_on | date, nullable | Set when it first enters Active |
| closed_on | date, nullable | Set on done or dropped |
| close_note | string, nullable | Required on dropped |
| est_hours | number, nullable | Mainly for backlog sorting |
| cost | number, nullable | For certifications |

`target_date` is not stored — it is computed from the horizon, or null when there is none. The same function returns the window start, which is what pace needs.

**milestones**

| Field | Type | Notes |
| --- | --- | --- |
| id | string |  |
| goal_id | string |  |
| title | string | A checkpoint, not a chore |
| sort_order | number |  |
| status | enum | todo, doing, done |
| competency_id | string | Inherits from the goal, overridable |
| evidence_url | string, nullable |  |
| evidence_note | string, nullable | One of the two is required to mark done |
| target_date | date, nullable | Optional, for its own timeline marker |
| completed_at | date, nullable |  |

**tasks**

| Field | Type | Notes |
| --- | --- | --- |
| id | string |  |
| goal_id | string | Always set |
| milestone_id | string, nullable | Null when the goal has no milestones |
| title | string | Finishable within a week |
| status | enum | todo, doing, done |
| effort | enum | S, M, L |
| started_on | date, nullable |  |
| completed_at | date, nullable |  |

**wins**

For achievements that were never planned — you ran an incident, mentored someone through a promotion, made an architecture call that stuck. These are often your best promotion evidence and they never come from a goal.

| Field | Type | Notes |
| --- | --- | --- |
| id | string |  |
| title | string |  |
| happened_on | date |  |
| competency_id | string |  |
| impact_note | string | The number, where one exists |
| evidence_url | string, nullable |  |

**Progress rollup**

- Goal % = done tasks ÷ total tasks across the goal, whether or not those tasks sit under a milestone. Flat count, so a five-task milestone is not worth the same as a one-task one.
- Milestone % = done tasks ÷ its own tasks. A milestone can also be marked done directly, which completes its remaining tasks.
- Progress bars are driven by tasks; the text beside them reads `3 of 5 milestones` where milestones exist. Two granularities, one bar.
- Optional refinement, off by default: weight tasks by effort, S=1, M=3, L=5. Turn it on only if unweighted percentages start feeling dishonest.
- A parent goal's percentage is the flat task count across itself and its children.
- **Pace** = goal % minus percentage of the horizon window elapsed. Positive is ahead, negative is behind. Goals with no horizon have no pace and show progress only — they are never coloured red for being slow, which is the point of leaving the horizon off.

## Pages and navigation

Four screens. Everything you need day to day is on the first, and nothing useful is more than two clicks deep.

| \# | Screen | What it answers |
| --- | --- | --- |
| 1 | **Dashboard** | When is everything due, what am I doing, what's next, what did I just finish, what's waiting |
| 2 | **Master table** | Everything, sliced any way I want |
| 3 | **Goal detail** | How is this one goal actually going |
| 4 | **Achievements** | What have I done, and where am I thin |

Navigation is a persistent top bar with those four items, plus a quick-add button pinned to the right that works from any screen. No sidebars, no nested menus, no settings page worth speaking of.

Goal detail is reached by clicking any goal from screens 1, 2 or 4 — it is a drill-in, never a destination you navigate to cold.

## Screen 1 — Dashboard

Below the timeline, four zones, stacked in this order. The order matters: it runs from present to future to past to parked, which is the order you actually think in. Because the timeline already carries every goal's progress bar, the cards here stay compact — this half of the page is about what to pick up next, not about status.

**Zone A — Doing now.** Active goals, one card each, designed to stay readable at ten goals. Each card shows the title, the horizon badge, a progress bar, `8/14 tasks · 3 of 5 milestones`, the pace indicator, and the next unfinished task in smaller text. The pace indicator is a small coloured dot: green ahead or on time, amber slightly behind, red well behind or past target. Sorted by pace worst-first, so what needs attention floats to the top by itself.

Below the cards, a flat list of every task currently in Doing, across all goals. This is your real working set. If it exceeds about eight rows, show a quiet line saying so — too many things in flight is the most common way this kind of system fails.

**Zone B — Up next.** Three to five suggested tasks, pulled automatically: the next unfinished task from each active goal that has nothing currently in Doing. One click moves a row from here to Doing. No manual queue to curate.

**Zone C — Recently completed.** The last 30 days of reached milestones and wins, newest first, each with its date, competency tag and a link to its evidence. This is deliberately the visually richest zone on the page — the one place with real colour, larger type and evidence thumbnails where they exist. It exists for morale as much as record-keeping: on a week when nothing feels like it is moving, you scroll and see nine things you actually did. Entries arriving here get a brief entrance animation, which is the payoff for finishing something.

**Zone D — Backlog.** Collapsed by default to a single line: `14 goals in backlog — 4 certifications, 6 skills, 4 domains`. Expanding gives a sortable list with estimated hours, cost and competency. Sort by hours ascending to answer "I have a free weekend, what can I actually finish." Each row has one action: move to Active. Framed as a menu of options rather than a queue — no ages, no "sitting here 8 months", no overdue styling. Nothing in the backlog is late, by definition.

Across the top of all four zones sits a thin summary strip: active goal count, milestones reached this month, current quarter's overall percentage, and the weakest competency by evidence count over the last 90 days. That last figure is the one that should quietly nag you.

## The timeline

The hero of the dashboard, not a band under a header. Full width, and tall enough to fill the viewport below the top bar. The four zones move below it — you scroll down to reach them.

It scrolls in both directions and they mean different things: **horizontal is time**, **vertical is your list of goals**. Row heights are fixed (goal 32px, milestone 22px) so the number of visible rows is predictable, and the whole grid scrolls vertically inside the timeline rather than pushing the page around.

**Rows and nesting.** Sticky group headers for each horizon — Yearly, Quarterly, Monthly, Custom — with goals nested beneath the header they belong to. Each goal is one long bar spanning its computed window. Beneath a goal sit its milestone rows, indented and inside the parent's span.

**Two layer toggles** in the timeline's top-left corner: Milestones and Tasks. Defaults are milestones on, tasks off. With both off you get a clean one-row-per-goal view of the quarter, which is the view you will screen-share.

**Tasks do not get their own rows.** Most tasks have no dates, so placing them on a time axis would be inventing information. Instead, toggling Tasks on subdivides each milestone bar into segments, one per task, completed segments filled and the rest hollow. Same height, no extra rows, and you can see at a glance that a milestone is four tasks in and two from done. A goal with no milestones has its own bar subdivide the same way.

**Bar anatomy.** Every bar is two colours: the container, drawn across the whole time window in a muted track colour, and the fill, drawn from the left to the goal's current percentage in the accent colour. Length is time, fill is progress — they are deliberately the same object, so a bar that is half-drawn on a window that is three-quarters elapsed looks wrong at a glance.

The percentage sits inside the bar, bottom-right, small and in a tabular font. When the bar is narrower than about 60px the number moves just outside the right edge instead of being clipped. Goal bars always show the number; milestone bars show it only on hover, to keep the grid quiet.

**Colour states.** Container muted, fill accent, past-due fill red, completed muted-green and no longer bold, paused fill drawn with reduced opacity. Past goals stay on the timeline rather than disappearing, so scrolling back through last year doubles as a year-in-review.

**Time axis.** Opens centred on today, showing roughly the previous month through the next four, with a vertical today-line running the full height of the grid. That line doing its work against the bar fills is the whole point of the view. A zoom control offers three levels — month, quarter, year — and a "today" button snaps back after scrolling. Milestones carrying their own target date get a tick on the parent goal's bar even when the milestone layer is toggled off.

**Deadline rail.** A narrow column pinned to the right edge listing everything due in the next 30 days, soonest first. It overlays rather than shrinking the grid, and collapses to a thin tab with a count badge. Now that the timeline is full height, this defaults to collapsed — the grid answers the question most days and the rail is for when you want it in words.

**Empty rows and overflow.** Goals with no horizon never appear here — that is the trade-off for leaving it off, and a muted line at the bottom of the grid reads `6 goals without a horizon` linking to the master table. If the goal count exceeds the visible rows, the vertical scrollbar is the only signal needed; no pagination.

**Mobile.** Two axes of scroll inside a scrolling page does not work on a phone. On narrow screens the timeline collapses to a stacked list of goal bars, each full-width with its own window as a label, retaining the container-and-fill treatment and the percentage. The time axis itself is desktop-only.

Clicking any bar opens that goal's detail. Dragging a bar's end to change a custom goal's dates is a nice-to-have, not phase 2.

## The activity heatmap

A GitHub-style grid, one cell per day, rolling twelve months, scrolling horizontally with the most recent week at the right edge.

**Intensity.** Cell colour comes from how many tasks you completed that day, in five buckets: 0 empty, 1 lightest, 2–3, 4–5, 6+ darkest. A milestone reached counts as three tasks for shading purposes, since reaching one is a bigger day than ticking one box. Empty days are a neutral empty cell — never red, never marked as a miss.

**One rule this design depends on: no streak counter.** Not "14 days running", not a longest-streak figure, not a warning that a streak is about to break. The grid is a record of what happened; a streak turns it into a debt you owe it. If a streak number ever gets added, the heatmap should come out with it.

**Hover.** Hovering a past cell shows that day's detail — tasks completed, milestones reached, wins logged — each linked to its goal. Clicking a cell opens the master table filtered to that date.

**Overlays**, each its own toggle, all off by default:

| Toggle | Shows |
| --- | --- |
| Upcoming milestones | Future cells with a milestone target date get an outline ring; hover shows what's due |
| Goal deadlines | Future cells carrying a goal's computed target date get a heavier ring |
| Goals completed | Past cells where a goal was finished get a small dot in the corner |

With overlays on, the grid extends past today to the end of the current quarter, greyed beyond today so past and future never read as the same thing. This is the one place in the app where the backward and forward halves sit in a single picture, which is the reason it is worth building despite the overlap with the timeline.

**Size and placement.** Full width, about 120px tall with the month labels. Sits below the timeline by default, above the four zones. On mobile it drops to the last 13 weeks rather than 12 months, so the cells stay tappable.

## Dashboard customisation

The dashboard is built from panels rather than a fixed page, so you can arrange it once and stop thinking about it.

**The panels:** Timeline · Summary strip · Activity heatmap · Doing now · Up next · Recently completed · Backlog · Completion trend · Quarter burn-up · Competency balance. The last three are the charts, available on the dashboard as well as on the achievements screen.

**Edit layout mode**, toggled from the top bar. Panels grow a drag handle and an eye icon; everything else on the page goes quiet. Drag to reorder vertically, click the eye to hide. Hidden panels collect in a tray at the bottom of edit mode so they are easy to bring back. Exit, and the dashboard renders as arranged.

**Single column, vertical reorder only.** No free-form grid, no resizing, no drag-to-a-column. A layout engine is a week of work and a permanent source of bugs, and the win over simple reordering is small when the panels are all full-width by nature. Two exceptions worth allowing: Up next and Backlog may be marked half-width, and pair side by side when both are.

**Persistence.** Layout is stored in the database as `layout/default`, not in browser storage, so the arrangement follows you from laptop to phone. A reset-to-default button sits in edit mode. Mobile ignores half-width pairing and stacks everything.

One caution: the point of hiding panels is to fit how you work, not to hide what is uncomfortable. If Competency balance is the panel you turn off, that is worth noticing.

## Screen 2 — Master table

One table, every milestone and win as a row, with the goal and objective denormalised into columns so you never need a join to read it.

Columns: Goal · Horizon · Milestone · Task · Status · Competency · Effort · Target · Completed · Evidence. Milestone rows and task rows share the table, distinguished by an indent and a type chip.

Above it: a search box, and filter chips for status, horizon, competency and goal kind. Group-by is a dropdown offering goal, competency, horizon or status. Nothing else — resist adding a saved-views feature until you have wanted one three times.

Four preset buttons cover almost every real use, so you rarely touch the filters by hand:

- **Everything open** — status is todo or doing
- **This quarter** — horizon is quarterly, current period
- **Completed** — status done, newest first
- **By competency** — grouped, which is the promotion-prep view

Inline editing matters here. Changing status, competency or evidence should happen in the cell, without opening anything. This screen is where you do bulk tidying — a Sunday-evening pass to move things along — so every field a weekly review touches must be editable in place.

Rows are colour-coded only by status, with one exception: a task in Doing for more than 21 days gets a subtle marker. Things that sit in Doing forever are the honest signal that a goal has stalled, and this is where you catch them.

## Charts and progress signals

Five visuals, and each has to earn its place by changing a decision.

**1. Goal progress bars** (dashboard, Zone A). The workhorse. Percentage complete with a thin pace marker overlaid showing where you *should* be by today's date. The gap between the fill and the marker is the whole story, readable in half a second.

**2. Completion trend** (dashboard, summary strip or achievements). Tasks completed per week over the last twelve weeks, as a small bar chart. Answers the only honest question about consistency: am I still moving? Weekly, not daily — daily granularity turns learning into a guilt machine.

**3. Competency balance** (achievements). A horizontal bar per competency, counting evidence items in the last 90 days. Horizontal bars over a radar chart: bars are actually readable at a glance, and the point is to show the shortest one. This is the chart that tells you to go do something with business impact.

**4. Quarter burn-up** (dashboard). One line for cumulative tasks completed this quarter, one straight reference line for the pace needed to finish everything committed. Two lines, no more. Scoped to the quarter because that is the horizon you can still change the outcome of.

**5. Achievement timeline** (achievements). A vertical chronological list, grouped by month, with competency tags. Not strictly a chart, but it is the thing you scroll through before a performance review and the thing you screen-share in one.

**Leave out:** streak counters, time-spent tracking, pie charts of any kind, and anything showing goals per category. They look like insight and change no decision. The activity heatmap is the one contribution-style grid that earns its place here, and only on the condition set out in its own section: no streaks attached to it, ever.

## Quick-add

Capture friction is what kills trackers, so this gets real design attention rather than a form.

One button, available on every screen, opening a single text box. You type plain language and it lands in the right place:

- *"Learn vector databases for the doc-analysis project, quarterly"* → a new goal, horizon quarterly, kind skill, competency technical judgment, with the why-line left blank and prompted for
- *"Done: shipped the confidence-score review queue, saves the ops team \~3 hrs/week"* → a win, dated today, competency business impact, impact note captured
- *"AWS Solutions Architect Pro, backlog, \~60 hrs, $400"* → a backlog goal, kind certification, hours and cost filled

The parse is done by a model call, and it always returns a filled form for you to confirm rather than writing silently. Wrong guesses are then a one-field fix, not a mistrust problem. If the call fails, the box falls back to the plain form — capture never depends on the network.

One more entry point worth building early: a **weekly review** prompt. Once a week it opens with what you moved, anything sitting in Doing over 21 days, and one question — what did you finish that is not in here yet? Most unplanned wins are lost simply because nobody asked at the right moment.

## Look, feel and technical approach

**Shape.** A single-page web app, published as an artifact so it has a URL you can open on your phone and share a read-only view of when the promotion conversation comes.

**Styling.** Use the Claude design tokens rather than hand-picked colours — define them once on `:root`, redefine under a dark-mode block, and reference them everywhere. Nothing hardcoded. This is what keeps four screens visually consistent without a design system, and it means the whole app re-themes from one place.

**Storage.** The artifact database, keyed as `goals/<id>`, `milestones/<id>, tasks/<id>`, `wins/<id>`. Persists across sessions and devices, and can be read and written from a conversation, which means you can ask Claude to bulk-load or reorganise goals without touching the UI. Dashboard layout lives in the database too, as layout/default, so your arrangement follows you across devices. Browser storage is only for throwaway view state — the last filter you used, whether the deadline rail was open.

**Typography and density.** This is a data app you will scan quickly, not a document. Tight line heights, one accent colour used only for progress fills and the active nav item, everything else in greys. Numbers in a tabular font so columns line up.

**Mobile.** The dashboard must work on a phone, because Zone C and the quick-add are things you will reach for away from a desk. Zones stack; cards drop to one column; the master table gets horizontal scroll rather than a redesigned mobile layout — it is a desktop screen and that is fine.

**Seed data.** Ship with your real goals already in it, not a demo. An empty dashboard on day one is the single most likely reason it gets abandoned.

## Out of scope

Named explicitly, because each one is a plausible-sounding addition that would make this heavier without making it better.

- **Job applications and interview tracking.** Separate concern, separate system.
- **Note storage.** This tracks progress and links to evidence; it does not hold your notes. Link out to wherever they already live.
- **Time tracking, pomodoros, study timers.** Hours spent is not progress.
- **Spaced repetition and flashcards.** A different tool for a different job.
- **Course catalogues or curriculum suggestions.** The dashboard tracks what you decided to learn, it does not decide for you.
- **Sharing, collaboration, multi-user.** Read-only export is enough.
- **A fourth hierarchy level.** If a goal needs one, split the goal.

## Build order

Each phase is usable on its own, so you can stop after any of them and still have something worth opening.

**Phase 1 — the spine.** Data model, master table with inline editing, the plain add form. No dashboard yet, no charts. Load your real goals in. If the table alone is not useful, the design is wrong and better to know now.

**Phase 2 — the dashboard.** The four zones, the timeline band and its deadline list, goal progress bars with pace markers, goal detail drill-in. This is the point where it becomes a daily object rather than a spreadsheet.

**Phase 3 — the backward half.** Achievements screen, competency balance bars, achievement timeline, wins as a first-class thing. This is where the promotion-packet value shows up, and it is the half most people never build.

**Phase 4 — friction removal.** Natural-language quick-add, the weekly review prompt, completion trend and quarter burn-up charts, the activity heatmap, and panel customisation. Customisation last, deliberately: rearranging a dashboard is a pleasant way to avoid using one.

A note on sequencing: phase 3 is tempting to defer, because phases 1 and 2 feel complete on their own. Defer it and this stays a learning tracker — useful, but not the thing you can put in front of a manager.
