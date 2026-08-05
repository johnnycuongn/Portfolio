# Projects Horizontal Rail Implementation Plan

> **Addendum (2026-08-05):** Three-tier sizing: 85% of one card below 768px, 1½
> cards from 768px to 1079px, and 2⅓ cards at 1080px and wider. `ProjectRail.css`
> is the source of truth for the card-width formula; the `next/image` `sizes`
> prop is three-tier. The rest of this document is left as originally written.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-card Projects grid in section 3 with a horizontally scrolling snap rail of tall cards that frames two full cards plus one third of a third.

**Architecture:** A new `ProjectRail` component owns a native `overflow-x` scroller with CSS scroll-snap and renders every entry in `PROJECTS` — no more hardcoded indices in `page.tsx`. `ProjectCard` is reshaped from a horizontal split into a vertical stack (image on top, body below, stack pills at the bottom). Card width comes from a CSS formula in `ProjectRail.css` so the ⅓ peek holds at any viewport width. Scroll position drives a progress bar, an `NN / NN` counter and prev/next arrows.

**Tech Stack:** Next.js 15.1.7 (App Router), React 19, TypeScript 5, TailwindCSS 3.4.1, `motion` 12 (imported as `motion/react`), `react-icons` 5.

**Spec:** `docs/superpowers/specs/2026-08-05-projects-horizontal-rail-design.md`

## Global Constraints

- **There is no test suite in this repo.** The automated gates are `npm run lint` and `npm run build`. Every task ends with both, plus an explicit manual verification checklist. Do not add a test framework — it is out of scope for this spec.
- **All site content lives in `src/app/PORTFOLIO.ts`.** Never hardcode project text, titles, or stacks into a component.
- **Palette is fixed:** `bg-slate-900` page, `bg-slate-800` cards, white primary text, `text-gray-300`/`text-gray-400` secondary. The single accent is teal — `text-teal-300` and `bg-teal-400/10`. Do not introduce a second accent colour.
- **Do not touch the page's scroll mechanics.** `h-[300vh]`, `containerHeight`, the three `y`/opacity transforms and the debounced snap handler at `page.tsx:66-87` stay exactly as they are.
- **Card width formula:** `flex: 0 0 calc((100% - 3rem) / 2.333)` at `md`+ with a `1.5rem` gap. This is derived from `2⅓ cards + 2 gaps = 100%`. If the gap changes, the `3rem` must change with it (it is `2 × gap`).
- Motion respects `useReducedMotion()` from `motion/react` everywhere it is introduced.
- Remote images are only allowed from hosts allowlisted in `next.config.ts` (currently `raw.githubusercontent.com/johnnycuongn/**`).

---

### Task 1: Type and complete the project data

`PROJECTS` currently has four entries: #1 and #2 are byte-identical duplicates, and #4 (QMDCL) omits `description`, `image` and `stacks` entirely. That omission widens the inferred union type, so `project.stacks` cannot be safely read — which is why the card gets away with never rendering it today. The rail renders the whole array, so this has to be fixed before anything consumes it.

**Files:**
- Modify: `src/app/PORTFOLIO.ts:68-103`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface Project { id: string; title: string; image: string; github: string; description: string; stacks: string[] }`, exported as a type. `PROJECTS: Project[]` with **3** entries, all fields non-optional.

- [ ] **Step 1: Add the `Project` interface and retype the array**

Replace the whole `const PROJECTS = [...]` block (lines 68-100) with this. Note the duplicate second entry is gone, and QMDCL is populated from the copy that already exists in this file's `JobTimelineData` entry for Queensland Murray Darling Catchment — do not invent new project copy.

```ts
interface Project {
  id: string;
  title: string;
  image: string;
  github: string;
  description: string;
  stacks: string[];
}

const PROJECTS: Project[] = [
  {
    id: uuid(),
    title: 'Smart Inventory Management System',
    github: 'https://github.com/johnnycuongn/Inventory-Management-Sytem',
    image: 'https://raw.githubusercontent.com/johnnycuongn/Inventory-Management-Sytem/main/github_resources/poster.png',
    description: 'A Smart Inventory System leveraging RFID technology to enhance efficiency in Inbound and Outbound Warehouse Processes.',
    stacks: ["React", "Typescript", "Node.js", "MongoDB", "Vercel"]
  },
  {
    id: uuid(),
    title: 'Supplier Receipt Tracker',
    image: 'https://raw.githubusercontent.com/johnnycuongn/sp_app/master/github_resources/poster.png',
    github: 'https://github.com/johnnycuongn/sp_app',
    description: 'The Supplier Receipt Tracker is designed to streamline invoice management for businesses in Retail, Manufacturing, Construction, and Hospitality sectors. This intuitive platform helps users track both digital and physical invoices, providing a comprehensive dashboard to monitor financial health.',
    stacks: ["React", "Typescript", "Firebase"]
  },
  {
    id: uuid(),
    title: 'QMDCL Water Quality Monitoring Platform',
    image: '',
    github: '',
    description: 'Led the development of Water Quality Monitoring platforms, built a new mobile app for river rangers to collect water data in offline mode, and improved the existing web app for data visualization.',
    stacks: ["React", "React Native", "Typescript", "Node.js", "Material UI", "Firebase"]
  }
];
```

- [ ] **Step 2: Export the `Project` type**

Change the last two lines of the file from:

```ts
export { JobTimelineData as TimelineData, PORTFOLIO, PROFILE_LINKS, PROJECTS };
export type { JobTimeLineItem };
```

to:

```ts
export { JobTimelineData as TimelineData, PORTFOLIO, PROFILE_LINKS, PROJECTS };
export type { JobTimeLineItem, Project };
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint && npm run build`
Expected: both PASS. `page.tsx` still references `PROJECTS[0]` and `PROJECTS[1]`, which now resolve to Smart Inventory and Supplier Receipt Tracker — so the page renders two cards with different content than before. That is expected and correct at this stage.

- [ ] **Step 4: Commit**

```bash
git add src/app/PORTFOLIO.ts
git commit -m "refactor: type PROJECTS and remove duplicate entry"
```

> **Owner follow-up, not a blocker:** the QMDCL entry has no poster image and no GitHub URL. Task 2 renders a gradient placeholder for it, and the card link falls back to `github.com/johnnycuongn`. Adding a fourth project later is a single object appended to this array — no component changes.

---

### Task 2: Reshape ProjectCard into a vertical card

The card is currently a horizontal split (image left, text right) sized for a grid cell, carrying `md:m-4` margins and an `index === 2` branch that encode grid positions which will no longer exist. It also never renders `stacks`.

**Files:**
- Modify: `src/app/_components/ProjectCard.tsx` (whole file)

**Interfaces:**
- Consumes: `PROJECTS` and the `Project` type from Task 1.
- Produces: `ProjectCard` accepting the unchanged props `{ className?: string; index: number; projectId: string }`. Renders a `data-rail-card` attribute on its root element — Task 3 queries that attribute to measure one card's width for arrow scrolling. The root element carries no margin, so a parent can control its width entirely via `className`.

- [ ] **Step 1: Replace the file contents**

```tsx
import { motion, useAnimation, useReducedMotion } from 'motion/react';
import { FC, memo } from 'react';
import Image from 'next/image';
import { FiExternalLink } from "react-icons/fi";
import { PROJECTS } from '../PORTFOLIO';
import useDelayedLinkOpen from '@/utils/useDelayLinkOpen';

interface ProjectCardProps {
  className?: string;
  index: number;
  projectId: string;
}

const FALLBACK_LINK = 'https://github.com/johnnycuongn';

const ProjectCard: FC<ProjectCardProps> = memo(({className, index, projectId}) => {

  const project = PROJECTS.find(project => project.id === projectId) ?? {
    id: '1',
    title: 'Empty',
    image: '',
    github: '',
    description: '',
    stacks: []
  };
  const controls = useAnimation();
  const reduceMotion = useReducedMotion();
  const { navigating, navigate } = useDelayedLinkOpen(200)

  const handleProjectClicked = async (e: React.MouseEvent) => {
    e.preventDefault()

    if (navigating) return;

    await controls.start({
      x: '100%',
      y: '-100%',
      opacity: 0,
      transition: { duration: 0.5 }
    });
    navigate(project.github || FALLBACK_LINK);
    setTimeout(async () => {
      await controls.start({
        x: '0',
        y: '0',
        opacity: 1,
        transition: { duration: 0.5 }
      });
    }, 2000)

  }

  return (
    <motion.div
      data-rail-card
      whileHover={reduceMotion ? undefined : { y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={(className ?? '') + ' overflow-hidden rounded-lg bg-slate-800 shadow-lg hover:shadow-xl'}>
        <div className="group/item relative flex h-full flex-col">
          <a
            href={project.github || FALLBACK_LINK}
            onClick={handleProjectClicked}
            className="absolute inset-0 z-10 cursor-pointer"
            aria-label={`${project.title} on GitHub`}
          ></a>

          <div className="relative shrink-0 basis-[55%] bg-slate-900">
            {project.image ? (
              <Image
                className="object-cover"
                src={project.image}
                alt={`${project.title} preview`}
                fill
                sizes="(max-width: 768px) 85vw, 41vw"
                quality={90}
                priority={index === 0}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-slate-700/40 to-slate-900" />
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-5">
            <h3 className="text-xl font-semibold text-white transition-colors group-hover/item:text-teal-300 md:text-2xl">
              {project.title}
              <motion.span
                className='inline-block ml-2'
                animate={controls}
                initial={{ x: 0, y: 0, opacity: 1 }}
              >
                <FiExternalLink />
              </motion.span>
            </h3>
            <p className="mt-2 line-clamp-3 text-sm leading-7 text-gray-300 md:text-base">
              {project.description}
            </p>
            <div className="mt-auto flex flex-wrap gap-1 pt-4">
              {project.stacks.map((stack) => (
                <span key={stack} className="flex items-center rounded-full bg-teal-400/10 px-3 py-1 text-xs font-medium leading-5 text-teal-300">
                  {stack}
                </span>
              ))}
            </div>
          </div>
        </div>
    </motion.div>
  )
})

ProjectCard.displayName = 'ProjectCard';

export default ProjectCard;
```

What changed and why — do not silently revert any of these:
- `md:p-3 md:m-4` **removed**. A `2rem` horizontal margin would break the card-width formula in Task 3, which assumes the card's border-box is exactly its flex basis.
- `isLastOdd` / `index === 2` **removed** — it selected a grid-only layout variant.
- `overflow-auto` on the inner wrapper **removed** (it created a nested scroller); `overflow-hidden` moved to the root so the image corners clip.
- `<h1>` → `<h3>`. The section title is already an `<h2>`; a page should not have an `<h1>` per card.
- Image gets a **conditional placeholder** — `next/image` throws on an empty `src`, and the QMDCL entry has none.
- `whileHover` is now suppressed under `prefers-reduced-motion`.
- `stacks` pills added, pinned to the bottom with `mt-auto`.

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint && npm run build`
Expected: both PASS.

- [ ] **Step 3: Eyeball the intermediate state**

Run: `npm run dev`, open `http://localhost:3000`, scroll to Projects.
Expected: **the layout will look wrong here, and that is fine.** The cards are now vertical but still sitting in the old grid, so they will be squat and the images oversized. What you are checking is only: both cards render, titles turn teal on hover, stack pills appear at the bottom, and the external-link icon still flies away on click. Task 3 fixes the layout.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/ProjectCard.tsx
git commit -m "refactor: reshape ProjectCard into a vertical card with stack pills"
```

---

### Task 3: Build the rail and wire it into the page

**Files:**
- Create: `src/app/_components/ProjectRail.css`
- Create: `src/app/_components/ProjectRail.tsx`
- Modify: `src/app/page.tsx:1-12` (imports), `src/app/page.tsx:152-168` (section 3 body)

**Interfaces:**
- Consumes: `PROJECTS` from Task 1; `ProjectCard` and its `data-rail-card` attribute from Task 2.
- Produces: `ProjectRail`, a default export taking **no props**. Fills its parent's height and width, so the parent must give it a definite height (`flex-1 min-h-0`).

- [ ] **Step 1: Create the stylesheet**

The card-width formula and scrollbar hiding live in CSS rather than Tailwind arbitrary values — the formula is easier to read and comment here, and it sidesteps Tailwind's parsing of `/` inside `[...]`. This mirrors the existing `Timeline.css` pattern.

Create `src/app/_components/ProjectRail.css`:

```css
/* Hide the native scrollbar; the teal progress bar below the rail replaces it. */
.rail-scroller {
  scrollbar-width: none;
}

.rail-scroller::-webkit-scrollbar {
  display: none;
}

/*
 * Card width is derived, not tuned. We want two full cards plus one third of a
 * third card in frame:
 *
 *   2⅓ cards + 2 gaps = 100%   ->   basis = (100% - 2 * gap) / 2.333
 *
 * The 3rem below is 2 * the 1.5rem (gap-6) used on the scroller at md+.
 * If the gap changes, change this with it.
 */
.rail-card {
  flex: 0 0 85%;
}

@media (min-width: 768px) {
  .rail-card {
    flex: 0 0 calc((100% - 3rem) / 2.333);
  }
}
```

- [ ] **Step 2: Create the rail component**

Create `src/app/_components/ProjectRail.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import { PROJECTS } from '../PORTFOLIO';
import ProjectCard from './ProjectCard';
import './ProjectRail.css';

const pad = (n: number) => String(n).padStart(2, '0');

const ProjectRail = () => {
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

  const scrollByCard = (direction: number) => {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-rail-card]');
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const step = (card?.offsetWidth ?? el.clientWidth) + gap;
    el.scrollBy({
      left: direction * step,
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  };

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
          className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-slate-900"
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

Two details that matter:
- `overscroll-x-contain` — without it, flicking past the last card triggers browser back-navigation on macOS trackpads.
- `[@media(pointer:fine)]:flex` combined with a default `hidden` shows the arrows only on devices with a precise pointer. On touch, the swipe gesture is self-evident.

- [ ] **Step 3: Swap the grid for the rail in `page.tsx`**

In the import block at the top of `src/app/page.tsx`, replace the `ProjectCard` import with `ProjectRail`, and drop `PROJECTS` from the `PORTFOLIO` import — after this change nothing in `page.tsx` references either, and `next lint` fails the build on unused imports.

Change line 6 from:

```tsx
import { PORTFOLIO, PROFILE_LINKS, PROJECTS } from "./PORTFOLIO";
```

to:

```tsx
import { PORTFOLIO, PROFILE_LINKS } from "./PORTFOLIO";
```

Change line 12 from:

```tsx
import ProjectCard from "./_components/ProjectCard";
```

to:

```tsx
import ProjectRail from "./_components/ProjectRail";
```

- [ ] **Step 4: Replace the grid markup**

In `src/app/page.tsx`, replace this block (currently lines 152-168):

```tsx
            <h2 className="text-4xl tracking-tight py-4">Projects</h2>
            <div className="w-full h-full grid grid-flow-col grid-rows-2 md:grid-rows-4 gap-4">
               
              {/* Project 1 */}
              <ProjectCard index={0} projectId={PROJECTS[0].id} 
                className="md:col-span-2 md:row-span-2"
              />
              {/* Project 2 */}
              <ProjectCard index={1} projectId={PROJECTS[1].id}
                className="md:col-span-2 md:row-span-2"
              />
              {/* Project 3
              <ProjectCard index={2} projectId={PROJECTS[2].id}
                className="md:row-span-4"
              /> */}

            </div>
```

with:

```tsx
            <h2 className="text-4xl tracking-tight shrink-0 py-4">Projects</h2>
            <div className="min-h-0 flex-1">
              <ProjectRail />
            </div>
```

The `min-h-0` is load-bearing: without it the flex child refuses to shrink below its content height and the rail overflows the viewport.

- [ ] **Step 5: Verify it compiles**

Run: `npm run lint && npm run build`
Expected: both PASS, with no unused-import warnings.

- [ ] **Step 6: Verify the rail in the browser**

Run: `npm run dev`, open `http://localhost:3000`, scroll to the Projects section at a ~1400px window width.
Expected, all of these:
- Two full cards visible with roughly one third of the third card showing past the right edge.
- The third card fades out into the page background rather than being hard-cut.
- Dragging/scrolling horizontally snaps cards to the left edge.
- The teal progress thumb moves left as you scroll and its width is visibly less than the full track.
- The counter reads `01 / 03` at rest and `03 / 03` at the far right.
- The left arrow is dimmed at rest; the right arrow dims once you reach the end.
- The QMDCL card shows a subtle slate gradient where its image would be.

- [ ] **Step 7: Commit**

```bash
git add src/app/_components/ProjectRail.tsx src/app/_components/ProjectRail.css src/app/page.tsx
git commit -m "feat: replace projects grid with horizontal snap rail"
```

---

### Task 4: Verification pass

Everything in this task is a check, not a change. If a check fails, fix it and re-run the whole task.

**Files:**
- Modify: only whatever a failing check turns up.

**Interfaces:**
- Consumes: the finished rail from Task 3.
- Produces: nothing.

- [ ] **Step 1: Responsive check**

Run `npm run dev` and use browser devtools device toolbar at three widths.
- **1400px** — 2 cards + ⅓ peek; arrows visible.
- **768px** — the `md` breakpoint boundary; confirm the card basis switches cleanly and no card is clipped vertically.
- **375px** — one card at ~85% width with the next peeking; arrows hidden (touch emulation on); text still readable and not overflowing its card.

- [ ] **Step 2: Confirm the rail does not break the page's section snapping**

Put the cursor over the rail and scroll vertically with a wheel or trackpad.
Expected: the page still snaps between Hero / Experience / Projects exactly as before. Horizontal rail scrolling does not fire `window` scroll events, so the handler at `page.tsx:66-87` is untouched — this check confirms that holds in practice.

- [ ] **Step 3: Confirm overscroll does not navigate back**

On a macOS trackpad, flick left-to-right hard past the first card.
Expected: the browser does **not** navigate to the previous page. If it does, `overscroll-x-contain` is missing or being overridden on the scroller.

- [ ] **Step 4: Keyboard and screen-reader check**

Press `Tab` repeatedly from the top of the Projects section.
Expected: focus reaches the rail region, then each card's link in order; the rail scrolls the focused card into view; arrow keys scroll the rail when the region itself holds focus; both arrow buttons are reachable and announce as "Previous project" / "Next project".

- [ ] **Step 5: Reduced-motion check**

Enable **System Settings → Accessibility → Display → Reduce motion** on macOS, then hard-reload the page.
Expected: clicking an arrow jumps the rail instantly rather than gliding, and hovering a card produces no vertical lift. Snapping still works — snap is layout, not motion.

- [ ] **Step 6: Final gate**

Run: `npm run lint && npm run build`
Expected: both PASS with no warnings.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address projects rail verification findings"
```

Skip this step if Steps 1-6 turned up nothing to change.

---

## Self-review

Checked against the spec:

| Spec section | Covered by |
|---|---|
| Layout and sizing (2⅓ formula, mobile basis, gap) | Task 3 Step 1 (`ProjectRail.css`) |
| Snap behaviour, `overscroll-behavior-x` | Task 3 Step 2; verified Task 4 Steps 1, 3 |
| Card anatomy (image 55%, clamped body, stack pills) | Task 2 Step 1 |
| Overlay link + fly-away icon preserved | Task 2 Step 1; verified Task 2 Step 3 |
| `isLastOdd` removed | Task 2 Step 1 |
| Affordances (counter, progress bar, arrows, fade) | Task 3 Step 2; verified Task 3 Step 6 |
| Component boundaries (`ProjectRail` renders the array) | Task 3 Steps 2-4 |
| Motion + reduced motion | Task 2 Step 1, Task 3 Step 2; verified Task 4 Step 5 |
| Accessibility (region, labels, disabled arrows) | Task 3 Step 2; verified Task 4 Step 4 |
| `Project` interface, `stacks` typing | Task 1 |
| Duplicate entry removed, QMDCL populated | Task 1 |
| Untouched: scroll mechanics, Timeline, hero, footer | No task modifies them; verified Task 4 Step 2 |

**Two deliberate deviations from the spec, both flagged for the owner:**

1. **Three projects, not four.** The spec recommended four and named "License Management System" as a candidate for the freed-up slot 2. Filling it means writing a project description that does not exist anywhere in the repo — inventing portfolio content is the owner's call, not the implementer's. Three ships correctly; travel is ~0.67 cards, which the spec labels TIGHT. Appending a fourth object to `PROJECTS` needs no component change.
2. **`scroll-pl` / `scroll-ml` dropped.** The spec called for scroll padding matching the scroller's horizontal padding. The rail ends up with no horizontal padding of its own — section 3's existing `p-4` provides it — so the extra utilities would offset snap stops by 1rem for no reason.

**Type consistency:** `ProjectCard`'s props (`className`, `index`, `projectId`) are unchanged from the current file and match Task 3's call site. The `data-rail-card` attribute set in Task 2 is the exact selector queried in Task 3. `Project` as defined in Task 1 has every field `ProjectCard` reads in Task 2 (`title`, `image`, `github`, `description`, `stacks`), and the component's fallback object matches that shape field-for-field.

**Placeholder scan:** no TBDs; every code step carries the full text to write, and every verification step names the command and the expected result.
