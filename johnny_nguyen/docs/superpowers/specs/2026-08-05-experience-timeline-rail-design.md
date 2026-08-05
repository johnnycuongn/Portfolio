# Experience Timeline — Rail Parity Redesign

Date: 2026-08-05
Status: Approved, ready for planning

## Problem

The Experience section is the last part of the site running on hand-written CSS with
magic numbers, and it no longer matches the Projects rail built alongside it.

Specific problems in `Timeline.tsx` / `Timeline.css`:

- **Magic numbers.** `padding: 300px 0`, `margin-left: -380px` on the first item,
  a hard-coded `width: 500px` card, and a `280px` override on the last item.
- **Imperative height measuring.** A `useEffect` pass reads `offsetHeight` on every
  card and writes an equal height back, re-running on resize. Flexbox does this natively.
- **Leaked listeners.** `mouseover`/`mouseout` handlers are attached to the `<ol>` in
  `useEffect` and never removed; only the `resize` listener is cleaned up.
- **Off the design language.** A 5px `--white` line and `--midnight-green` (`#01565b`)
  dots, plus CSS triangle `::before` notches on each card, against a site that is
  otherwise flat teal-on-slate. `--yellow` is declared and unused.
- **Vertical cost.** Cards alternate above and below the line, so the section needs
  roughly 600px of vertical room inside a fixed `h-screen` panel.
- **Swallowed scroll.** The horizontal scroller has no wheel forwarding, so a vertical
  wheel gesture over the timeline never reaches the page's section-snap handler — the
  same Chrome behavior already fixed in `ProjectRail`.
- **No progress affordance.** No counter, no progress track, no arrow buttons, no
  focus-scroll — all of which Projects has.
- **Duplicate data.** The WebVine entry in `PORTFOLIO.ts` appears twice verbatim, so
  three jobs render as four cards.

## Approach

Keep Experience horizontal and rebuild it on the same primitive as `ProjectRail`, so the
two sections share one interaction vocabulary.

The central design move: **the timeline line, the scrollbar, and the year axis become a
single element.** Today there are two horizontal lines doing overlapping work — a
decorative white one running through the Experience cards, and a functional teal progress
track under the Projects rail. Merging them removes the dots, the notches, and the
alternating layout, and reclaims the vertical space they cost.

Rejected alternatives:

- *Restyle only* — recolor the existing CSS to teal and tighten spacing. Cheapest, but
  repaints the fragile parts rather than removing them.
- *Depth pass* — add per-card `rotateY` driven by distance from viewport centre. Deferred;
  can be layered on later without changing this structure.

## Design

### Component structure

| File | Change |
|---|---|
| `src/utils/useRail.ts` | **New.** Shared rail behavior. |
| `src/app/_components/Timeline.tsx` | Rewritten: scroller + axis. |
| `src/app/_components/TimelineCard.tsx` | **New.** The card, mirroring the `ProjectRail`/`ProjectCard` split. |
| `src/app/_components/ProjectRail.tsx` | Refactored onto `useRail`. No visual change. |
| `src/app/_components/ProjectRail.css` | Renamed `Rail.css`; now serves both rails. |
| `src/app/_components/Timeline.css` | **Deleted.** |
| `src/app/PORTFOLIO.ts` | Remove duplicate job; add optional `axisLabel`. |

### `useRail` hook

Owns everything the two rails do identically:

- the scroller ref and the `sync` callback computing `visible`, `ratio`, `atStart`, `atEnd`
- the resize listener
- the wheel-forwarding effect, including its `deltaMode` unit handling
- `scrollByCard(direction)`, respecting `useReducedMotion`

Returns `{ railRef, visible, ratio, atStart, atEnd, sync, scrollByCard }`.

The existing comments in `ProjectRail.tsx` explaining *why* wheel forwarding is needed —
Chrome redirecting vertical deltas into horizontal scrollers, `overscroll-behavior-x`
stopping the chain, Firefox reporting `DOM_DELTA_LINE` — move into the hook with the code.
The comment marking the arrow buttons as functionally load-bearing stays with the buttons.

### The axis

```
  ┌─ cards ──────────────────────────────────────┐
  │                                              │
  └──────────────────────────────────────────────┘
  ────●─────────────●──────────────●─────────  ← →
    2024–25       2023           2022
   ▔▔▔▔▔▔▔▔▔▔ teal fill = window in view
```

- An `h-px` track in `bg-white/10` spanning the rail width.
- A teal fill using the thumb math already in `ProjectRail`:
  `width: visible * 100%`, `left: ratio * (1 - visible) * 100%`.
- One dot per job, positioned at its card's proportional place along the track.
- The job's short year label sits beneath its dot in mono `text-xs tracking-widest`.
- The job currently centred in frame renders its dot and label `text-teal-300`; the others
  sit at `text-gray-400` and dim further.
- Dots are `<button>`s that scroll their card into view, each with an `aria-label` naming
  the job.
- Arrow buttons sit at the right of the axis row, styled identically to the Projects rail,
  visible only under `@media(pointer:fine)`.

Active index is derived from `ratio` the same way the Projects counter derives its index.

### The card

One baseline, no alternating. Text-only, so narrower than a project card:

- 85% width on mobile, 2 across at ≥768px, 3 across at ≥1080px. `Rail.css` gains a second
  class, `.timeline-card`, alongside `.rail-card`; both derive their width from the formula
  already documented there — `basis = (100% - floor(n) * gap) / n` — and both assume the
  rail's `gap-4 md:gap-6`. The Projects tiers are unchanged.
- `bg-slate-800 rounded-lg`, matching `ProjectCard`.
- Contents top to bottom: full date range in `text-sm text-gray-400`; `Title • Company` at
  `text-xl` turning `text-teal-300` on hover, carrying the existing fly-away
  `FiExternalLink` via `useDelayedLinkOpen`; description in `text-gray-300` filling the
  remaining space; teal stack pills pinned to the bottom with `mt-auto`.
- Cards reach equal height through `h-full` on flex items — no measuring pass.

### Motion and behavior

- Sibling-dim on hover is kept, driven by React state (a `hoveredIndex` on `Timeline`)
  rather than DOM `classList` mutation, which also fixes the leaked listeners.
- Cards lift on hover with the same `y: -4` spring as `ProjectCard`, gated on
  `useReducedMotion`.
- Active-dot transition is a colour and scale tween of roughly 200ms.
- Focusing a card scrolls it into view, matching the behavior already in `ProjectCard`.
- The scroller carries `role="region"`, `aria-label="Experience"`, `tabIndex={0}`.
- Vertical wheel gestures over the timeline forward to the page, so section snapping works
  over the Experience section.

### Data

- Delete the duplicated WebVine entry, leaving three jobs.
- Add an optional `axisLabel?: string` to `JobTimeLineItem` for the short axis year
  (`'2024–25'`, `'2023'`, `'2022'`), falling back to `year` when absent. The full
  `"Nov 2024 - Feb 2025"` string continues to render on the card.
- Order stays newest-first; the axis year labels make the direction legible without
  reversing the data.

## Out of scope

- Any change to the Projects section's appearance. `ProjectRail` is refactored onto the
  shared hook and must look and behave exactly as it does now.
- The page-level scroll and snap machinery in `page.tsx`. Section 2's markup is unchanged;
  `Timeline` continues to fill `h-full`.
- Per-card 3D depth transforms.

## Verification

No test suite exists. Verify by hand with `npm run dev`:

1. Three job cards render, WebVine appears once.
2. Horizontal drag, trackpad swipe, arrow buttons, and arrow keys all scroll the rail; the
   teal fill tracks position.
3. A vertical wheel gesture over the timeline scrolls the page and snaps between sections.
4. Clicking each axis dot scrolls its job into view; the active dot and label turn teal.
5. Tabbing through cards scrolls each into view.
6. Hovering a card dims its siblings; the title turns teal; the external-link icon flies
   away on click and the link opens.
7. The Projects section looks and behaves exactly as before.
8. With `prefers-reduced-motion: reduce`, scrolling is instant and cards do not lift.
9. `npm run build` and `npm run lint` pass.
