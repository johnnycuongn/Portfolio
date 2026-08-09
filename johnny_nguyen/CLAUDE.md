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

- **All site content lives in `src/app/PORTFOLIO.ts`** — name, role, tech tags, resume link, profile links, job timeline entries, project cards, and the `ASK` block (copy for the `/ask` surface). To change any text or add a job/project, edit this file rather than the components. Entries get `uuid()` ids at module load, so ids are not stable across renders/builds.
- **`src/app/page.tsx` is the whole page** and drives the core scroll effect: three full-viewport sections are `fixed`-positioned and translated/faded via `useScroll` + `useTransform` keyed off `window.innerHeight`, inside a `300vh` container. A debounced scroll listener snaps to the nearest section. Any new section requires updating the container height (`h-[300vh]`), the `y`/opacity transforms, and the snap math together.
- `src/app/_components/` holds the presentational pieces (nav bar, Timeline, ProjectCard, ProfilesLinkGroup, MouseAndCat cursor-follow effect). They read data from `PORTFOLIO.ts` directly (e.g. `ProjectCard` looks up a project by id) rather than receiving it as props.
- `src/utils/` has small hooks: `useMousePosition`, `useDelayLinkOpen` (delays opening a link so a card animation can play), and `wait`.
- Project card images are loaded from `raw.githubusercontent.com/johnnycuongn/**`, which is allowlisted in `next.config.ts` — new remote image hosts must be added there.
- Path alias `@/*` maps to `src/*`.

## The /ask route

`/ask` (`src/app/ask/`) is a second surface alongside the scrolling page: a prompt-driven Q&A that answers in full-viewport slides (Editorial/List/Experience/Projects) instead of prose. `src/app/ask/_components/` holds the per-format slide renderers plus `HistoryTrail`; conversation state and streaming live in the `useAsk` hook (`src/utils/useAsk.ts`), with turns persisted to `localStorage` via `src/utils/askStorage.ts` (`loadAsk`/`saveAsk`) — `loadAsk` shape-validates every restored turn so a corrupted or tampered entry is dropped instead of crashing the renderer.

The model's reply protocol is in `src/app/_ai/`: a leading `[[SLIDE LIST|EXPERIENCE|PROJECTS|RAIL]]` tag (parsed by `scanLeadingTag`/`parseSlideBody` in `slides.ts`, tolerant of leading whitespace) picks the slide format, and a trailing `[[RECAP …]]` sentinel — alongside the pre-existing `[[CONTACT]]` and `[[RESUME]]` sentinels in `sentinel.ts` — carries the model's own summary of the turn. Any malformed or unrecognized tag/sentinel is a safe failure to plain Editorial, never an error.

**Answer cache:** `src/app/_ai/cache.ts` provides pure matching logic (normalized phrasing lookup, then keyword scoring with safety thresholds), while `src/app/_ai/cacheStore.ts` handles IO against the Vercel blob backend (`ask-cache/v1.json`, 60s in-memory TTL). The route checks the cache before calling the model and writes back clean first-turn answers (context-free, no actions) via `canWriteBack`. Cache seeds live in `src/app/_ai/seeds.ts` and are installed via `npm run seed:ask --dry` (preview) or `npm run seed:ask` (real write when a blob token is set); the seeder checks by id before adding. Without the token, caching is silently a no-op.

**Rail format:** `[[SLIDE RAIL]]` renders as `SlideRail`, a horizontally snap-scrolling card component shared with the projects section; parsed by `parseRailCards`, which splits body lines on ` | ` into title/detail pairs.

**Contact on /ask:** When the model emits `[[CONTACT]]`, the route passes an optional draft message to `ContactFormCard`, which owns collecting the visitor's name and email separately—the model never asks for either. A confirm step precedes the send, and all failures degrade to the site's existing mailto link.

`BLOB_MESSAGE_READ_WRITE_TOKEN` (this store's prefixed name; `BLOB_READ_WRITE_TOKEN` is honoured as a fallback — see `src/app/_ai/blobToken.ts`, which every blob call passes explicitly), if set, enables private per-turn transcript logging for `/ask` only (`src/app/_ai/transcript.ts` — one append-only blob per turn under the visitor's anonymous session id). Without the token it's silently a no-op, so it's optional for local dev.

Pure logic here (the slide/sentinel protocol, storage, etc.) is verified by `npm run check`, which runs the `scripts/check-*.ts` tsx assertion scripts in place of a test suite — add new assertions there rather than introducing one.

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
