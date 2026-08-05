# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This site is Johnny's **resume as a visual presentation** — a portfolio that shows who he is (role, experience, projects) with personality, not just a static CV. Design quality matters as much as code quality here.

## Commands

```bash
npm run dev     # Start dev server at http://localhost:3000
npm run build   # Production build
npm run lint    # ESLint (next lint)
```

There is no test suite. The site is deployed on Vercel.

## Architecture

A single-page personal portfolio site built with Next.js 15 (App Router), React 19, TypeScript, TailwindCSS, and the `motion` animation library (imported as `motion/react`).

- **All site content lives in `src/app/PORTFOLIO.ts`** — name, role, tech tags, resume link, profile links, job timeline entries, and project cards. To change any text or add a job/project, edit this file rather than the components. Entries get `uuid()` ids at module load, so ids are not stable across renders/builds.
- **`src/app/page.tsx` is the whole page** and drives the core scroll effect: three full-viewport sections are `fixed`-positioned and translated/faded via `useScroll` + `useTransform` keyed off `window.innerHeight`, inside a `300vh` container. A debounced scroll listener snaps to the nearest section. Any new section requires updating the container height (`h-[300vh]`), the `y`/opacity transforms, and the snap math together.
- `src/app/_components/` holds the presentational pieces (nav bar, Timeline, ProjectCard, ProfilesLinkGroup, MouseAndCat cursor-follow effect). They read data from `PORTFOLIO.ts` directly (e.g. `ProjectCard` looks up a project by id) rather than receiving it as props.
- `src/utils/` has small hooks: `useMousePosition`, `useDelayLinkOpen` (delays opening a link so a card animation can play), and `wait`.
- Project card images are loaded from `raw.githubusercontent.com/johnnycuongn/**`, which is allowlisted in `next.config.ts` — new remote image hosts must be added there.
- Path alias `@/*` maps to `src/*`.

## Design language

The current design, so changes stay coherent with it:

- **Dark, minimal, one accent color.** `bg-slate-900` page background, `bg-slate-800` cards, white primary text, `text-gray-300/400` secondary text. The single accent is teal: tech/stack tags are `rounded-full bg-teal-400/10 text-teal-300` pills, and hover states turn titles `text-teal-300`. The Timeline's own CSS (`Timeline.css`) uses a matching palette (`--midnight-green: #01565b` dots/scrollbar on a white line).
- **Three full-screen acts.** Hero (name at `text-6xl`, role, profile icons, description + tech pills) → Experience (horizontal-scrolling timeline, cards alternating above/below the line) → Projects (grid of image+text cards) + footer. Section titles are `text-4xl`. Generous whitespace; no borders, boxes, or decoration beyond the cards themselves.
- **Playful micro-motion is the personality.** Everything animates subtly via `motion/react`: nav/profile items are drag-to-reorder (`Reorder`) and periodically nudge or jump; external-link icons "fly away" on click before the link opens (`useDelayLinkOpen`); cards scale slightly on hover; hovering one timeline item dims its siblings; a glowing firefly dot (`MouseAndCat`) wanders the page and flees the cursor, leaving a fading trail. Motion is small-amplitude, short-duration, and never blocks reading.
- **Typography note:** Geist Sans/Mono are loaded in `layout.tsx` as CSS variables but `globals.css` sets the body font to Arial — the variables are not actually applied.

### Design direction

When asked for design work, be **creative and innovative — propose bold, beautiful ideas — but keep the result minimal**:

- Brainstorm freely (layout, motion, typography, texture), then distill: prefer refining or replacing an element over adding one.
- Stay dark with a single accent; if introducing color, it replaces teal everywhere rather than joining it.
- New motion should follow the existing character: subtle, playful, physics-y, never loud or blocking.
- Whitespace and large type are the aesthetic — resist filling empty space.
- Content stays in `PORTFOLIO.ts`; design changes should not hardcode text into components.
