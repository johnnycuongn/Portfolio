# Experience View Toggle — Line ⇄ Rail

Date: 2026-08-05
Status: Approved, ready for planning

## Starting point

The Experience section was rebuilt as a horizontal card rail
(`docs/superpowers/specs/2026-08-05-experience-timeline-rail-design.md`). That work is
complete and passing, sitting uncommitted in the working tree on branch
`experience-timeline-rail`.

The original alternating timeline — a white line through the vertical centre with cards
above and below it — is recoverable from `HEAD` (`Timeline.tsx`, `Timeline.css`).

## Problem

The rail replaced the original timeline outright. The original is the design the site
should lead with; the rail is worth keeping as an alternative view. Neither should win —
the visitor should be able to switch, and the switch itself should be a piece of the
site's personality rather than a utility control.

## Approach

Restore the original timeline as the **default** view, keep the rail as the **alternate**,
and put a small switch beside the "Experience" heading. Flipping it plays a single morph:
cards travel to a common baseline and expand, the line slides down and becomes the rail's
axis, the dots turn teal and shrink into ticks.

The spacing of the original is tightened as part of the restore (approved) — the design is
faithful, the vertical budget is not.

Rejected alternatives for the transition:

- *Line leads* — a two-beat sequence, the line moving first and the cards following.
  Reads as cause and effect but costs ~250ms more. One touch of it is kept: the line
  starts ~80ms ahead of the cards.
- *Fold down* — cards hinge through 3D onto the baseline. The most memorable option and
  the loudest; rejected as too showy for a portfolio built on restraint.

## Design

### One set of cards, two layouts

Rendering a timeline subtree and a rail subtree and swapping them cannot morph: Framer
Motion animates an element by measuring it before and after, and two subtrees mean the old
one unmounts and the new one mounts. Cards would cross-fade, not travel.

So the cards are rendered **once** and never unmount. Each is a `motion.div` carrying the
`layout` prop. `Timeline` holds a `mode` of `'line' | 'rail'`; flipping it changes the
container's layout classes, Framer measures each card's old and new box, and animates the
difference. No `AnimatePresence` around the cards.

The line and the dots are the exception — see "The line becomes the axis" below.

### State and persistence

- `mode` lives in `Timeline`, initialised to `'line'`.
- It is persisted to `localStorage` under a single key and read back in an effect **after
  mount**, never during render, so the server-rendered HTML and the client's first paint
  always agree. A visitor with a stored preference sees `line` for one frame before the
  effect applies their choice; this is accepted as the cost of avoiding a hydration
  mismatch.

### The switch

A pill beside the heading: 32×18px track in `bg-white/14`, a 13px teal knob that slides
across, and a mono `text-[10px] tracking-widest` label reading `LINE` or `RAIL`.

It is a real `<button role="switch" aria-checked={mode === 'rail'}>` with an accessible
name, keyboard operable, with a visible focus ring.

This requires moving `<h2>Experience</h2>` out of `page.tsx` and into `Timeline`, so the
heading and the control that governs it live together. Projects keeps its heading in
`page.tsx`. The resulting asymmetry between the two sections is accepted deliberately.

### Line mode — faithful in look, rebuilt underneath

The visual result is the original: a white hairline through the vertical centre, cards
alternating above and below it, a dot per job, horizontal scrolling.

Two pieces are rebuilt rather than restored verbatim, because the morph cannot animate
them as they were:

- **The line.** Each `<li>` was itself a line segment (`height: 5px; background: white`),
  so the "line" was four separate boxes. It becomes one element spanning the scroll
  content.
- **The dots.** They were `li::after` pseudo-elements, which Framer cannot animate. They
  become real per-job elements.

Not restored: `margin-left: -380px` on the first item, the `280px` last-item override, the
`padding: 300px 0`, the CSS triangle `::before` notches, and the JS equal-height measuring
pass. Flexbox gives equal heights, and the notches conflict with the flat card language
used everywhere else on the site.

### Both modes are flex rows

The scroller stays a horizontal flex container in both modes; only the cards' vertical
behaviour changes.

- **Line mode:** each card takes a fixed height and alternates `self-start` / `self-end`,
  clearing the centre line by 16px on each side. Descriptions clamp to 3 lines.
- **Rail mode:** cards `self-stretch` to the scroller's capped height. Descriptions clamp
  to 6 lines, as they do today.

Card **widths are identical in both modes** — the existing `.rail-card` tiers (85% mobile,
1.5 cards at ≥768px, 2.333 at ≥1080px). The original's 500px cards in 400px slots made
neighbours overlap horizontally; dropping that means the morph is purely vertical, so
cards stay in their columns and simply resolve onto one baseline. This is calmer than
cards also sliding sideways, and it makes the alternation visibly resolve — which is the
point of the transition. It is a deliberate departure from the original's horizontal
density and is a one-line change to revisit.

### Tightened vertical budget

| Piece | Height |
|---|---|
| Card (line mode, fixed) | 192px (`h-48`) |
| Gap to centre line, each side | 16px |
| Line | 1px |
| **Card area total** | **417px** |
| Heading + switch row | ~60px |
| Bottom row (arrows, plus the axis in rail mode) | ~32px |
| **Section total** | **~510px** |

192px is the smallest height that holds a date, a title, a 3-line description, and a row
of stack pills without clipping; it is the one number here that should be eyeballed
against real content and adjusted if it reads tight.

Against the original's ~600px card area plus chrome. This fits an 800px-tall viewport with
room to spare, which the original did not.

### The line becomes the axis

The line and dots are the one place where elements genuinely swap parents: in line mode
they live **inside** the scroller so they scroll with the cards and each dot sits under its
own card, as the original did; in rail mode the axis track is a fixed element **below** the
scroller.

Because the parent changes, these use `layoutId` rather than `layout`:

- the line element and the axis track share `layoutId="timeline-line"`
- each line-mode dot shares a `layoutId` with its corresponding axis tick

Framer morphs between them across the unmount/mount. The line's colour animates from
`rgba(255,255,255,.5)` to `white/10`, the dots from `#01565b` at 9px to `teal-300` at 6px,
and the teal progress fill wipes in as the axis arrives.

This means the two modes' bottom rows differ: in rail mode it holds the axis (track, ticks,
year labels) followed by the arrow buttons; in line mode the line and dots are up in the
scroller, so the row holds the arrows alone. Year labels belong to the axis and therefore
appear only in rail mode — they fade in as it arrives and fade out as it leaves. Each
card carries its own full date range in both modes, as the original did, so no date
information is lost in line mode.

### Motion

Total transition ~450ms. The line starts ~80ms before the cards. Cards stagger by ~25ms
each and settle with a gentle overshoot, matching the `type: 'spring'` character used
elsewhere. Descriptions and pills fade in as cards gain the height to hold them.

Reversing the switch plays the same transition backwards.

### Reduced motion and accessibility

- Under `prefers-reduced-motion`, `layout` and `layoutId` animation is disabled and the
  swap is instant. This is a hard opt-out, not a slowed-down version.
- Arrow buttons remain in **both** modes — every vertical wheel event over the scroller is
  forwarded to the page, so they stay the only wheel-free way to scroll a rail.
- Card links, focus-scroll-into-view, and the axis dot buttons work in whichever mode is
  showing.
- The switch announces its state via `role="switch"` and `aria-checked`.

## Out of scope

- The Projects section, including its heading placement. Untouched.
- The page-level scroll and snap machinery in `page.tsx`. Section 2's sizing classes stay
  as the rail work left them; only the `<h2>` moves out.
- Content in `PORTFOLIO.ts`, which already carries `axisLabel` from the rail work.
- Any 3D or fold transition.

## Verification

No test suite exists. Verify by hand with `npm run dev`:

1. The section loads in line mode: white line through the centre, cards alternating above
   and below, a dot per job.
2. The switch sits beside "Experience", is keyboard reachable, and announces its state.
3. Flipping to rail: cards travel to one baseline and expand, the line slides down and
   becomes the axis, dots turn teal and shrink. Flipping back reverses it.
4. The choice survives a page reload.
5. Both modes scroll horizontally; arrows work in both; a vertical wheel over either
   scrolls the page and snaps sections.
6. The section fits an 800px-tall viewport without clipping in either mode.
7. Card links, hover dimming, and the fly-away icon work in both modes.
8. With `prefers-reduced-motion: reduce`, the swap is instant and nothing animates.
9. The Projects section is unchanged.
10. `npm run lint` and `npm run build` pass.
