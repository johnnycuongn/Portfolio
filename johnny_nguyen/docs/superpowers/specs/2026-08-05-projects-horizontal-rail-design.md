# Projects Horizontal Rail — Design (2026-08-05)

Replace the Projects grid in section 3 with a horizontally scrolling snap rail of tall
cards. Two goals, both from the site owner:

1. **Capacity** — the project list is meant to grow; a two-up grid has nowhere to put a
   fourth or fifth entry.
2. **Coherence** — Experience already scrolls horizontally. Making Projects rhyme with it
   gives the two middle acts a shared gesture.

Design direction per CLAUDE.md: creative but minimal, dark with a single teal accent,
subtle physics-y motion, content stays in `PORTFOLIO.ts`.

## Approaches considered

1. **Snap rail on native scroll (chosen)** — `overflow-x` scroller with CSS scroll-snap,
   plus a progress bar, counter and arrow buttons. Native momentum, touch, keyboard and
   screen-reader support come free, and it never touches the vertical wheel.
2. **`motion/react` drag carousel** — closest to the site's existing personality (the nav
   is drag-to-reorder, the firefly flees the cursor). Rejected for now: it reimplements
   touch/keyboard/a11y by hand, and drag collides with the card's full-bleed overlay `<a>`
   unless a movement threshold is added. Can be layered on later without a rewrite.
3. **Scroll-pinned horizontal pan** — most cinematic, and reuses the `useScroll` idiom
   already in `page.tsx`. Rejected: it fights the page's core mechanic. The debounced
   handler at `page.tsx:66-87` rounds to the nearest `containerHeight` multiple on every
   scroll event, so a pan would be yanked back mid-gesture. Fixing that means reworking
   `h-[300vh]`, all three `y` transforms and the snap math together — the exact coupling
   CLAUDE.md warns about — and it displaces the footer.

## Layout and sizing

The section is full-viewport-height, so cards are **tall portraits**, not the current
landscape split. The viewport frames **two full cards plus one third of a third card**.
That peek is the scroll affordance; it is derived, not hand-tuned:

```
2⅓ cards + 2 gaps = 100%   →   basis = (100% - 2·gap) / 2.333
```

- **Desktop (`md`+)**: `gap: 1.5rem`, so `flex-basis: calc((100% - 3rem) / 2.333)`.
  On a ~1368px content width that puts each card near **566 × 620**.
- **Mobile**: `gap: 1rem`, `flex-basis: 85%` — one card at a time with a clear edge peek.
- Card height fills the rail: section height minus the `Projects` heading and footer,
  roughly `100vh - 220px` on a 900px-tall viewport.

The rail is a flex row with `snap-x snap-mandatory`; each card is `snap-start`. The
scroller carries `scroll-pl` matching its horizontal padding so snap stops line up with
the content edge rather than the viewport edge.

`overscroll-behavior-x: contain` on the scroller — without it, flicking past the last card
triggers browser back-navigation on macOS trackpads.

## Card anatomy

`ProjectCard` is reshaped from a horizontal split into a vertical stack:

- **Image, top 55%** — `next/image` with `fill`, `object-cover`,
  `sizes="(max-width: 768px) 85vw, 41vw"`, `priority` on the first card only.
- **Body** — title (`text-xl md:text-2xl`, turns `text-teal-300` on group hover) with the
  existing fly-away `FiExternalLink`; description clamped to 3 lines; **stack pills pinned
  to the bottom**.
- Stack pills are new to the card. `PROJECTS` entries already carry `stacks` and the card
  never rendered them; the tall shape makes room, and the `rounded-full bg-teal-400/10
  text-teal-300` pill is the same component language as the hero and the Timeline.
- The full-bleed overlay `<a>` and the delayed-open animation stay exactly as they are.
- The `isLastOdd` / `index === 2` branch is deleted — it encoded a grid position that no
  longer exists.

## Affordances

A footer strip below the rail, in the Timeline's visual language (white line, teal mark):

- **Counter** — `01 / 04`, mono, `text-gray-400`. Communicates the total, which the
  progress bar only implies.
- **Progress bar** — `h-[2px]` track at `bg-white/10`; the `bg-teal-300` thumb's width is
  `clientWidth / scrollWidth` and its offset is `ratio × (1 − width)`, so it reads as a real
  scrollbar rather than a decorative meter.
- **Arrows** — ghost circles, `border-white/20`, teal on hover, scrolling by one card plus
  one gap. Disabled at each end. Hidden under `@media (pointer: coarse)`, where the gesture
  is already obvious.

The right edge gets a `linear-gradient` fade to `slate-900` so cards dissolve out of frame
instead of being hard-cut. Native scrollbar is hidden; the progress bar replaces it.

## Component boundaries

- **`ProjectRail.tsx` (new)** — owns the scroller, scroll-position state, and the footer
  affordances. Renders every entry in `PROJECTS`; takes no props. Depends on `PROJECTS`
  and `ProjectCard`.
- **`ProjectCard.tsx`** — presentational, one project. Keeps its current
  `projectId`-lookup contract so the rail passes ids, not objects.
- **`page.tsx`** — the hardcoded two-card grid at lines 153-168 collapses to
  `<ProjectRail />` inside a `flex-1 min-h-0` wrapper. Section 3 becomes heading → rail →
  footer in a flex column.

This removes the reason projects were commented out in the page: the rail renders the
array, so adding a project means editing `PORTFOLIO.ts` only.

## Motion

- Card hover keeps the existing `y: -4` spring (`stiffness: 300, damping: 24`).
- Arrow and programmatic scrolling use `behavior: 'smooth'`.
- `useReducedMotion` → `behavior: 'auto'`, no hover lift. Snap and layout are unaffected;
  they are not motion.
- **Not included:** hover-dimming of sibling cards (the Timeline's trick), and drag-to-pan.
  Both are additive rather than clarifying, and the brief is to refine, not accumulate.

## Accessibility

- Scroller: `role="region"`, `aria-label="Projects"`, `tabIndex={0}` so it is keyboard
  scrollable with arrow keys.
- Arrow buttons: `aria-label="Previous project"` / `"Next project"`, genuinely `disabled`
  at the ends rather than visually dimmed.
- Cards keep their overlay `<a>` and `aria-label`. `scroll-margin-inline` on cards so
  focusing a partly-visible card scrolls it fully into frame.
- The progress bar is decorative — `aria-hidden`.

## Content changes in `PORTFOLIO.ts`

The rail's sizing needs four projects to breathe: at 2⅓ cards visible, three projects give
only **0.67 cards of travel**, four give **1.67**. The layout code is identical either way,
so this is a content knob, not a blocker. Current state:

| # | Entry | Status | Action |
|---|-------|--------|--------|
| 1 | Smart Inventory Management System | Complete | Keep |
| 2 | Smart Inventory Management System | Byte-identical duplicate of #1 | Replace with a real project (License Management System is the obvious candidate) |
| 3 | Supplier Receipt Tracker | Complete, but commented out in `page.tsx` | Renders automatically once the rail maps the array |
| 4 | QMDCL Water Quality Monitoring | Empty `image`, `description`, `stacks` | Needs a poster image and two sentences, or delete until ready |

Also add an exported `Project` interface and type the array. Entry 4 currently omits
`stacks` entirely, which widens the inferred union and makes `project.stacks` unsafe to
read — the card only gets away with it today because it never renders them.

**Owner decision, not blocking implementation:** which projects fill slots 2 and 4. The
rail renders whatever the array holds, at any length.

## Untouched

Scroll/snap mechanics, `h-[300vh]`, `containerHeight` and all three `y`/opacity transforms,
the Timeline, the hero, the footer, `MouseAndCat`, and the colour palette.

## Verification

- `npm run lint` and `npm run build` clean.
- Rail scrolls, snaps, and shows the ⅓ peek at 1400px, 768px and 375px.
- Arrows disable correctly at both ends; progress thumb width matches visible fraction.
- Tab through the cards: each scrolls into view and the overlay link fires.
- Trackpad flick past the last card does not navigate back.
- `prefers-reduced-motion: reduce` removes smooth scrolling and the hover lift.
- Vertical scroll still snaps between the three sections while the cursor is over the rail.
