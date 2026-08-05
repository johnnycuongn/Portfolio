# Experience Timeline Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Experience section as a horizontal rail matching the Projects rail, merging the timeline line, scrollbar, and year axis into a single element.

**Architecture:** Extract the behavior `ProjectRail` already has — scroll-position state, wheel forwarding, card-step scrolling — into a shared `useRail` hook in `src/utils/`. Rewrite `Timeline` on top of it as a snap-scrolling row of `bg-slate-800` cards on one baseline, with an axis beneath that is simultaneously the progress scrollbar and the year legend. Delete `Timeline.css` and its magic numbers.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, TailwindCSS, `motion/react`, `react-icons/fi`.

**Spec:** `docs/superpowers/specs/2026-08-05-experience-timeline-rail-design.md`

## Global Constraints

- **No test suite exists in this repo** (see `CLAUDE.md`). The TDD cycle does not apply. Every task instead ends with explicit manual verification in `npm run dev` plus, where code changed, `npm run lint`. Do not add a test framework.
- All site copy lives in `src/app/PORTFOLIO.ts`. Never hardcode names, dates, job text, or stack names into a component.
- Dark, minimal, single teal accent. Cards are `bg-slate-800` on a `bg-slate-900` page. Stack pills are exactly `rounded-full bg-teal-400/10 px-3 py-1 text-xs font-medium leading-5 text-teal-300`. Hover states turn titles `text-teal-300`.
- Every motion effect must be gated on `useReducedMotion()` from `motion/react`.
- The Projects section must look and behave **exactly** as it does now when this is finished. It is refactored, not redesigned.
- Path alias `@/*` maps to `src/*`.
- Commit after each task using the message given in that task's final step.

---

### Task 1: Fix the job data

The WebVine entry is duplicated verbatim, so three jobs render as four cards. The axis also needs a short year label per job, distinct from the full date range shown on the card.

**Files:**
- Modify: `src/app/PORTFOLIO.ts:25-66`

**Interfaces:**
- Consumes: nothing.
- Produces: `JobTimeLineItem` gains `axisLabel?: string`. `TimelineData` becomes a 3-element array (WebVine, Orefox AI, QMDC). Tasks 4 and 5 read `job.axisLabel ?? job.year`.

- [ ] **Step 1: Add `axisLabel` to the interface**

In `src/app/PORTFOLIO.ts`, change the `JobTimeLineItem` interface to:

```ts
interface JobTimeLineItem {
  year: string;
  /** Short label for the timeline axis, e.g. '2023'. Falls back to `year`. */
  axisLabel?: string;
  title: string;
  company: string;
  content: string;
  link: string;
  stacks: string[];
}
```

- [ ] **Step 2: Delete the duplicate job and add axis labels**

Replace the entire `JobTimelineData` array with:

```ts
const JobTimelineData: JobTimeLineItem[] = [
  {
    year: 'Nov 2024 - Feb 2025',
    axisLabel: '2024–25',
    title: 'Software Engineer Intern',
    content: "Managed and built License Management System from the ground up, which is used to manage Sharepoint Licenses for over 10 clients.",
    company: 'WebVine',
    link: 'https://webvine.com.au/',
    stacks: ['React', 'Next.js', 'Typescript', 'TailwindCSS', '.NET Core', 'Sharepoint SPFx', 'Azure'],
  },
  {
    year: 'Feb - Oct 2023',
    axisLabel: '2023',
    title: 'Junior Software Engineer',
    company: 'Orefox AI',
    content: 'Worked closely with senior engineers to improve current Orefox GeoDesk platforms and new apps. Responsible for advanced features including GeoDesk Scrum Board, Geological Map, Marketplace Platform, and Geologist Chat Platform',
    link: 'https://orefox.com/',
    stacks: ['React', 'Typescript', 'jQuery', 'Django', 'PostgreSQL', 'GeoDjango'],
  },
  {
    year: 'Mar - Dec 2022',
    axisLabel: '2022',
    title: 'Software Engineer',
    company: 'Queensland Murray Darling Catchment',
    link: 'https://qmdcl.org.au/',
    content: 'Led the development of Water Quality Monitoring platforms, built a new mobile app for river rangers to collect water data in offline mode, and improved the existing web app for data visualization.',
    stacks: ['React', 'React Native', 'Typescript', 'Node.js', 'Material UI', 'Firebase']
  }
];
```

Note the en-dash in `'2024–25'` — it is `–` (U+2013), not a hyphen.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`, open http://localhost:3000, scroll to the Experience section.
Expected: three cards, WebVine appears once. The section still uses the old styling at this point — that is correct, it is rebuilt in Task 4.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/PORTFOLIO.ts
git commit -m "fix: remove duplicate WebVine job, add axis labels"
```

---

### Task 2: Extract the `useRail` hook

`ProjectRail` owns scroll-sync state, a wheel-forwarding effect with subtle browser-specific handling, and card-step scrolling. Experience needs all of it. Move it to one place so the two rails cannot drift apart. Projects must be visually and behaviorally identical afterward.

**Files:**
- Create: `src/utils/useRail.ts`
- Modify: `src/app/_components/ProjectRail.tsx` (whole file)

**Interfaces:**
- Consumes: nothing.
- Produces: default export `useRail()` returning
  `{ railRef: RefObject<HTMLDivElement | null>, visible: number, ratio: number, atStart: boolean, atEnd: boolean, sync: () => void, scrollByCard: (direction: number) => void, scrollToCard: (index: number) => void }`.
  `visible` is the fraction of content in frame (0–1). `ratio` is scroll progress (0–1). `scrollByCard(1)` moves forward one card, `scrollByCard(-1)` back. `scrollToCard(i)` scrolls the i-th `[data-rail-card]` element to the start of the frame. Task 4 and Task 5 consume all of these.

- [ ] **Step 1: Create the hook**

Create `src/utils/useRail.ts` with exactly this content. The comments explaining *why* the wheel forwarding exists move here from `ProjectRail.tsx` — do not drop them, they document non-obvious browser behavior.

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Shared behavior for the site's horizontal rails (Projects, Experience):
 * scroll-position state for the progress bar, wheel forwarding, and
 * card-stepped scrolling. Rails consume this so they cannot drift apart.
 *
 * Cards inside the scroller must carry a `data-rail-card` attribute —
 * `scrollByCard` and `scrollToCard` locate them by it.
 */
const useRail = () => {
  const railRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // `visible` is the fraction of the content in frame — it becomes the
  // progress thumb's width, so the bar reads as a real scrollbar.
  const [visible, setVisible] = useState(1);
  const [ratio, setRatio] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const sync = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setVisible(el.scrollWidth > 0 ? el.clientWidth / el.scrollWidth : 1);
    setRatio(max > 0 ? el.scrollLeft / max : 0);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sync]);

  // Chrome redirects vertical wheel deltas into horizontally-scrollable
  // containers, and a rail's `overscroll-behavior-x: contain` then stops
  // them chaining onward — so a vertical gesture over a rail gets swallowed
  // and never reaches the page's section-snap handler. Forward vertical
  // intent to the window explicitly; horizontal intent falls through to the
  // scroller untouched.
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      // deltaY is only in pixels when deltaMode is DOM_DELTA_PIXEL. Firefox
      // reports DOM_DELTA_LINE for physical mouse wheels; forwarding the raw
      // value there would scroll ~19x too little and the page's debounced snap
      // would pull it straight back.
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      window.scrollBy({ top: e.deltaY * factor });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const scrollByCard = useCallback((direction: number) => {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-rail-card]');
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const step = (card?.offsetWidth ?? el.clientWidth) + gap;
    el.scrollBy({
      left: direction * step,
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  }, [reduceMotion]);

  const scrollToCard = useCallback((index: number) => {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelectorAll<HTMLElement>('[data-rail-card]')[index];
    // `block: 'nearest'` keeps this from fighting the page's fixed-position
    // sections — the same guard ProjectCard uses on focus.
    card?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      inline: 'start',
      block: 'nearest'
    });
  }, [reduceMotion]);

  return { railRef, visible, ratio, atStart, atEnd, sync, scrollByCard, scrollToCard };
};

export default useRail;
```

- [ ] **Step 2: Refactor `ProjectRail` onto the hook**

Replace the whole of `src/app/_components/ProjectRail.tsx` with:

```tsx
'use client'

import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { PROJECTS } from '../PORTFOLIO';
import ProjectCard from './ProjectCard';
import useRail from '@/utils/useRail';
import './ProjectRail.css';

const pad = (n: number) => String(n).padStart(2, '0');

const ProjectRail = () => {
  const { railRef, visible, ratio, atStart, atEnd, sync, scrollByCard } = useRail();

  const index = Math.round(ratio * (PROJECTS.length - 1)) + 1;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={railRef}
          onScroll={sync}
          role="region"
          aria-label="Projects"
          tabIndex={0}
          className="rail-scroller flex h-full snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain md:gap-6"
        >
          {PROJECTS.map((project, i) => (
            <ProjectCard
              key={project.id}
              index={i}
              projectId={project.id}
              className="rail-card snap-start"
            />
          ))}
        </div>
        <div
          aria-hidden
          className={
            'pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-slate-900 transition-opacity ' +
            (atEnd ? 'opacity-0' : 'opacity-100')
          }
        />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <span className="font-mono text-xs tracking-widest text-gray-400">
          {pad(index)} / {pad(PROJECTS.length)}
        </span>
        <div aria-hidden className="relative h-0.5 flex-1 rounded-full bg-white/10">
          <div
            className="absolute inset-y-0 rounded-full bg-teal-300"
            style={{
              width: `${visible * 100}%`,
              left: `${ratio * (1 - visible) * 100}%`
            }}
          />
        </div>
        {/*
          A plain mouse wheel only emits deltaY, and every wheel event over the
          rail is forwarded to the page (see the wheel handler in useRail) — so
          a desktop user without a trackpad has no wheel-driven way to scroll
          the rail. These arrows (and arrow-key scrolling) are their only means;
          treat this block as functionally load-bearing, not decorative.
        */}
        <div className="hidden gap-2 [@media(pointer:fine)]:flex">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            disabled={atStart}
            aria-label="Previous project"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-gray-300 transition-colors hover:border-teal-300 hover:text-teal-300 disabled:pointer-events-none disabled:opacity-25"
          >
            <FiArrowLeft />
          </button>
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            disabled={atEnd}
            aria-label="Next project"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-gray-300 transition-colors hover:border-teal-300 hover:text-teal-300 disabled:pointer-events-none disabled:opacity-25"
          >
            <FiArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectRail;
```

The CSS import still points at `./ProjectRail.css` — the rename happens in Task 3, once a second consumer exists.

- [ ] **Step 3: Verify Projects is unchanged**

Run: `npm run dev`, scroll to the Projects section. Check every one of these:
- Cards render; trackpad swipe scrolls horizontally.
- The teal progress bar moves and the `01 / 03` counter increments.
- Both arrow buttons scroll one card per click; left is disabled at the start, right at the end.
- The right-edge fade disappears when scrolled to the end.
- A **vertical** mouse wheel or two-finger vertical swipe over the rail scrolls the *page* and snaps to the next section.
- Tab into the rail and through the cards; each focused card scrolls into view.

Expected: identical to before the refactor. If anything differs, the hook extraction is wrong — fix before continuing.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors. In particular, no unused-import warnings in `ProjectRail.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/useRail.ts src/app/_components/ProjectRail.tsx
git commit -m "refactor: extract shared useRail hook from ProjectRail"
```

---

### Task 3: Share the rail stylesheet

Both rails now need the scrollbar-hiding and card-width rules, so the stylesheet is no longer Projects-specific.

**Files:**
- Rename: `src/app/_components/ProjectRail.css` → `src/app/_components/Rail.css`
- Modify: `src/app/_components/ProjectRail.tsx:5` (the CSS import)

**Interfaces:**
- Consumes: nothing.
- Produces: `Rail.css` exporting the classes `.rail-scroller` and `.rail-card`. Task 4 imports it and uses both.

> **Design note — read before implementing.** The spec called for a separate `.timeline-card` class showing 2 cards at ≥768px and 3 at ≥1080px. That is wrong: there are only three jobs, so 3-across means the Experience rail never scrolls on desktop, the axis goes inert, and the horizontal-timeline concept disappears. Both rails share `.rail-card`'s existing 1.5 / 2.333 tiers instead, which guarantees overflow. Do not add a `.timeline-card` class.

- [ ] **Step 1: Rename the file**

```bash
git mv src/app/_components/ProjectRail.css src/app/_components/Rail.css
```

- [ ] **Step 2: Update the header comment**

In `src/app/_components/Rail.css`, replace the first comment block (currently `/* Hide the native scrollbar; the teal progress bar below the rail replaces it. */`) with:

```css
/*
 * Shared by both horizontal rails — Projects (ProjectRail.tsx) and Experience
 * (Timeline.tsx). Changing a rule here changes both sections.
 */

/* Hide the native scrollbar; the teal progress bar below the rail replaces it. */
```

Leave the rest of the file — `.rail-scroller`, the width-derivation comment, and the `.rail-card` tiers — exactly as it is.

- [ ] **Step 3: Update the import**

In `src/app/_components/ProjectRail.tsx`, change:

```tsx
import './ProjectRail.css';
```

to:

```tsx
import './Rail.css';
```

- [ ] **Step 4: Verify**

Run: `npm run dev`, scroll to Projects.
Expected: unchanged — cards keep their widths and the native scrollbar stays hidden. A missing stylesheet shows up immediately as full-width cards and a visible grey scrollbar.

- [ ] **Step 5: Commit**

```bash
git add -A src/app/_components/
git commit -m "refactor: rename ProjectRail.css to Rail.css for shared use"
```

---

### Task 4: Rebuild the Experience rail

Replace the CSS timeline with a rail of cards on one baseline. This task delivers a working, scrollable Experience section **without** the axis; the axis lands in Task 5. `Timeline.css` and its magic numbers are deleted here.

**Files:**
- Create: `src/app/_components/TimelineCard.tsx`
- Modify: `src/app/_components/Timeline.tsx` (whole file)
- Modify: `src/app/page.tsx:134-137`
- Delete: `src/app/_components/Timeline.css`

**Interfaces:**
- Consumes: `useRail()` from Task 2; `Rail.css` classes from Task 3; `JobTimeLineItem` and `TimelineData` from Task 1.
- Produces: `TimelineCard` — default export, props
  `{ job: JobTimeLineItem; className?: string; dimmed: boolean; onHoverStart: () => void; onHoverEnd: () => void }`.
  It renders the `data-rail-card` attribute that `useRail` depends on. Task 5 adds the axis to `Timeline.tsx` and does not change `TimelineCard`.

- [ ] **Step 1: Create the card**

Create `src/app/_components/TimelineCard.tsx`:

```tsx
'use client'

import { motion, useAnimation, useReducedMotion } from 'motion/react';
import { FC } from 'react';
import { FiExternalLink } from 'react-icons/fi';
import { JobTimeLineItem } from '../PORTFOLIO';
import useDelayedLinkOpen from '@/utils/useDelayLinkOpen';

interface TimelineCardProps {
  job: JobTimeLineItem;
  className?: string;
  dimmed: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

const TimelineCard: FC<TimelineCardProps> = ({ job, className, dimmed, onHoverStart, onHoverEnd }) => {
  const controls = useAnimation();
  const reduceMotion = useReducedMotion();
  const { navigating, navigate } = useDelayedLinkOpen(200);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (navigating) return;

    if (reduceMotion) {
      navigate(job.link);
      return;
    }

    await controls.start({
      x: '100%',
      y: '-100%',
      opacity: 0,
      transition: { duration: 0.5 }
    });
    navigate(job.link);
    setTimeout(async () => {
      await controls.start({
        x: 0,
        y: 0,
        opacity: 1,
        transition: { duration: 0.5 }
      });
    }, 2000);
  };

  return (
    <motion.div
      data-rail-card
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      animate={{ opacity: dimmed ? 0.5 : 1 }}
      whileHover={reduceMotion ? undefined : { y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={(className ?? '') + ' overflow-hidden rounded-lg bg-slate-800 shadow-lg hover:shadow-xl'}
    >
      <div className="group/item relative flex h-full flex-col p-5">
        <a
          href={job.link}
          onClick={handleClick}
          onFocus={(e) => e.currentTarget.scrollIntoView({
            behavior: reduceMotion ? 'auto' : 'smooth',
            inline: 'nearest',
            block: 'nearest'
          })}
          className="absolute inset-0 z-10 cursor-pointer"
          aria-label={`${job.title} at ${job.company}`}
        ></a>

        <span className="text-sm text-gray-400">{job.year}</span>

        <h3 className="mt-1 text-xl text-white transition-colors group-hover/item:text-teal-300">
          {job.title} • {job.company}
          <motion.span
            className="ml-2 inline-block align-middle"
            animate={controls}
            initial={{ x: 0, y: 0, opacity: 1 }}
          >
            <FiExternalLink />
          </motion.span>
        </h3>

        <p className="mt-3 text-base leading-7 text-gray-300 transition-colors group-hover/item:text-white">
          {job.content}
        </p>

        <div className="mt-auto flex flex-wrap gap-1 pt-4">
          {job.stacks.map((stack) => (
            <span
              key={stack}
              className="flex items-center rounded-full bg-teal-400/10 px-3 py-1 text-xs font-medium leading-5 text-teal-300"
            >
              {stack}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default TimelineCard;
```

- [ ] **Step 2: Rewrite `Timeline`**

Replace the whole of `src/app/_components/Timeline.tsx` with:

```tsx
'use client'

import { useState } from 'react';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { TimelineData } from '../PORTFOLIO';
import TimelineCard from './TimelineCard';
import useRail from '@/utils/useRail';
import './Rail.css';

const Timeline = () => {
  const { railRef, atStart, atEnd, sync, scrollByCard } = useRail();
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="flex h-full w-full flex-col">
      {/*
        Cards stretch to the scroller's height, which is how they end up equal
        without measuring anything in JS. The cap keeps text-only cards from
        stretching to the full height of a screen-tall section.
      */}
      <div className="relative flex min-h-0 flex-1 items-center">
        <div
          ref={railRef}
          onScroll={sync}
          role="region"
          aria-label="Experience"
          tabIndex={0}
          className="rail-scroller flex h-full max-h-[26rem] w-full snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain md:gap-6"
        >
          {TimelineData.map((job, i) => (
            <TimelineCard
              key={`${job.company}-${job.year}`}
              job={job}
              className="rail-card snap-start"
              dimmed={hovered !== null && hovered !== i}
              onHoverStart={() => setHovered(i)}
              onHoverEnd={() => setHovered(null)}
            />
          ))}
        </div>
        <div
          aria-hidden
          className={
            'pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-slate-900 transition-opacity ' +
            (atEnd ? 'opacity-0' : 'opacity-100')
          }
        />
      </div>

      <div className="mt-6 flex items-center justify-end gap-4">
        {/*
          A plain mouse wheel only emits deltaY, and every wheel event over the
          rail is forwarded to the page (see the wheel handler in useRail) — so
          a desktop user without a trackpad has no wheel-driven way to scroll
          the rail. These arrows (and arrow-key scrolling) are their only means;
          treat this block as functionally load-bearing, not decorative.
        */}
        <div className="hidden gap-2 [@media(pointer:fine)]:flex">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            disabled={atStart}
            aria-label="Previous job"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-gray-300 transition-colors hover:border-teal-300 hover:text-teal-300 disabled:pointer-events-none disabled:opacity-25"
          >
            <FiArrowLeft />
          </button>
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            disabled={atEnd}
            aria-label="Next job"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-gray-300 transition-colors hover:border-teal-300 hover:text-teal-300 disabled:pointer-events-none disabled:opacity-25"
          >
            <FiArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
```

- [ ] **Step 3: Give the section the same flex sizing as Projects**

The rail needs a definite height to size cards against. In `src/app/page.tsx`, in Section 2, replace:

```tsx
            <h2 className="text-4xl tracking-tight py-4">Experience</h2>
            <div className="flex h-full w-full">
              <Timeline />
            </div>
```

with:

```tsx
            <h2 className="text-4xl tracking-tight shrink-0 py-4">Experience</h2>
            <div className="min-h-0 flex-1">
              <Timeline />
            </div>
```

This mirrors Section 3's structure exactly.

- [ ] **Step 4: Delete the old stylesheet**

```bash
git rm src/app/_components/Timeline.css
```

Confirm nothing still imports it:

Run: `grep -rn "Timeline.css" src/`
Expected: no output.

- [ ] **Step 5: Verify the rail**

Run: `npm run dev`, scroll to Experience. Check:
- Three cards sit side by side on one baseline — nothing above or below a line, no dots, no triangle notches.
- Cards are `bg-slate-800` and all the same height, roughly 26rem tall, vertically centred in the section.
- Trackpad swipe scrolls horizontally; the last card is partly off-frame at first, and the right-edge fade is visible.
- Arrow buttons step one card at a time and disable at each end.
- Hovering a card dims the other two and turns its title teal; the description brightens to white.
- Clicking a card flies the external-link icon away, then opens the company site in a new tab.
- A vertical wheel or two-finger vertical swipe over the rail scrolls the page and snaps sections.
- Resize the window from narrow to wide: card widths change at 768px and 1080px, nothing overflows the section, and no cards clip.

- [ ] **Step 6: Lint and build**

Run: `npm run lint && npm run build`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add -A src/app/
git commit -m "feat: rebuild Experience timeline as a horizontal rail"
```

---

### Task 5: Build the axis

The axis is the design centrepiece: one element that is at once the timeline line, the scrollbar, and the year legend. It replaces the arrows-only row added in Task 4.

**Files:**
- Modify: `src/app/_components/Timeline.tsx`

**Interfaces:**
- Consumes: `visible`, `ratio`, `scrollToCard` from `useRail()` (Task 2); `job.axisLabel` from Task 1.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Pull the remaining values off the hook**

In `src/app/_components/Timeline.tsx`, change the destructuring line to:

```tsx
  const { railRef, visible, ratio, atStart, atEnd, sync, scrollByCard, scrollToCard } = useRail();
```

- [ ] **Step 2: Add the active-job derivation**

Directly below the `hovered` state declaration, add:

```tsx
  // Which job is currently centred in frame. Mirrors how the Projects rail
  // derives its counter from scroll progress.
  const active = Math.round(ratio * (TimelineData.length - 1));
```

- [ ] **Step 3: Add the track to the arrows row**

The arrows row from Task 4 keeps its arrows and gains the track to their left. Change its opening tag from `<div className="mt-6 flex items-center justify-end gap-4">` to `<div className="mt-6 flex items-start gap-4">`, then insert the following block **between that opening tag and the arrows' `{/* ... */}` comment**:

```tsx
        {/*
          The track is the timeline line, the scrollbar, and the year axis at
          once: the teal fill is the window currently in frame, and each dot
          marks a job's place along the whole span. `pb-8` reserves room for
          the absolutely-positioned labels, which contribute no layout height.
        */}
        <div className="relative flex-1 pb-8">
          <div aria-hidden className="relative h-px w-full rounded-full bg-white/10">
            <div
              className="absolute inset-y-0 rounded-full bg-teal-300"
              style={{
                width: `${visible * 100}%`,
                left: `${ratio * (1 - visible) * 100}%`
              }}
            />
          </div>
          {TimelineData.map((job, i) => (
            <button
              key={`${job.company}-${job.year}`}
              type="button"
              onClick={() => scrollToCard(i)}
              aria-label={`Go to ${job.title} at ${job.company}, ${job.year}`}
              aria-current={i === active}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-2"
              // Each job owns an equal share of the track; the dot marks the
              // centre of its share, which keeps the first and last labels
              // clear of the track's ends.
              style={{ left: `${((i + 0.5) / TimelineData.length) * 100}%` }}
            >
              <span
                className={
                  '-mt-[2.5px] block h-1.5 w-1.5 rounded-full transition-all duration-200 ' +
                  (i === active ? 'scale-150 bg-teal-300' : 'bg-white/25')
                }
              />
              <span
                className={
                  'whitespace-nowrap font-mono text-xs tracking-widest transition-colors duration-200 ' +
                  (i === active ? 'text-teal-300' : 'text-gray-500')
                }
              >
                {job.axisLabel ?? job.year}
              </span>
            </button>
          ))}
        </div>
```

Leave the arrows block that follows — the load-bearing comment and both buttons — exactly as Task 4 left it, along with the row's closing `</div>`. Deleting the arrows would strip mouse-wheel users of their only way to scroll the rail.

- [ ] **Step 4: Verify the axis**

Run: `npm run dev`, scroll to Experience. Check:
- A hairline track spans the width beneath the cards, with three dots and the year labels `2024–25`, `2023`, `2022` beneath them.
- Dots sit centred on the line, not floating above or below it. If they are off by a pixel or two, adjust the `-mt-[2.5px]` value — it is the only tuned number here.
- A teal segment fills part of the track and slides as you scroll, its width matching the fraction of cards in frame.
- The dot and label for the job centred in frame are teal and slightly enlarged; the others are grey. Scrolling moves the highlight.
- Clicking each dot scrolls its card to the left edge of the frame.
- Neither the first nor last label is clipped at any window width from 375px up.

- [ ] **Step 5: Check keyboard access**

Tab through the section. Expected: the rail, each card link, each of the three dots, and both arrows are all reachable, and each shows a visible focus ring. Pressing Enter on a dot scrolls to that job.

- [ ] **Step 6: Lint and build**

Run: `npm run lint && npm run build`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/_components/Timeline.tsx
git commit -m "feat: merge timeline line, scrollbar, and year axis into one element"
```

---

### Task 6: Verification sweep

Walk the spec's acceptance list end to end, on a real viewport, before calling this done.

**Files:**
- Modify: only if a check fails.

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Run the full check list**

Run: `npm run dev` and verify each item:

1. Three job cards render; WebVine appears once.
2. Horizontal drag, trackpad swipe, arrow buttons, and arrow keys all scroll the rail; the teal fill tracks position.
3. A vertical wheel gesture over the timeline scrolls the page and snaps between sections.
4. Clicking each axis dot scrolls its job into view; the active dot and label turn teal.
5. Tabbing through cards scrolls each into view.
6. Hovering a card dims its siblings, turns the title teal, and the external-link icon flies away on click before the link opens.
7. The Projects section looks and behaves exactly as it did before this work.
8. The hero section is untouched.

- [ ] **Step 2: Check reduced motion**

Enable it at System Settings → Accessibility → Display → Reduce motion on macOS, then reload.
Expected: arrow buttons and dot clicks jump instantly instead of animating, cards do not lift on hover, and clicking a card opens the link without the fly-away animation. The section remains fully usable.

- [ ] **Step 3: Check narrow viewports**

In DevTools device toolbar, check 375px, 768px, 1080px, and 1440px widths.
Expected: at 375px one card fills 85% of the frame; card widths step at 768px and 1080px; the axis labels never overlap or clip; nothing overflows horizontally.

- [ ] **Step 4: Confirm the old code is gone**

Run: `grep -rn "setEqualHeights\|timeline-item\|midnight-green" src/`
Expected: no output. Any hit means a fragment of the old implementation survived.

- [ ] **Step 5: Final build and lint**

Run: `npm run lint && npm run build`
Expected: both pass with no new warnings.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address Experience rail verification findings"
```

Skip this step if nothing needed fixing.
