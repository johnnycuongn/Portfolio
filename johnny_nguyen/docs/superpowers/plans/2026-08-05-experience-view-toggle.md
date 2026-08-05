# Experience View Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original alternating timeline as the Experience section's default view, keep the existing rail as an alternate, and morph between them with a switch beside the heading.

**Architecture:** One list of cards is rendered once and never unmounts; a `mode` of `'line' | 'rail'` changes their layout, and Framer Motion's `layout` prop animates each card between the two measured boxes. The line and the axis ticks are the exception — they genuinely change parent, so they morph via shared `layoutId` instead.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, TailwindCSS, `motion/react`, `react-icons/fi`.

**Spec:** `docs/superpowers/specs/2026-08-05-experience-view-toggle-design.md`

**Starting point:** the rail implementation is complete and uncommitted in the working tree on branch `experience-timeline-rail`. `src/utils/useRail.ts`, `src/app/_components/{Timeline,TimelineCard,ProjectRail}.tsx`, and `src/app/_components/Rail.css` all exist in their post-rail state. Read them before starting.

## Global Constraints

- **No test suite exists in this repo** (see `CLAUDE.md`). The TDD cycle does not apply. Every task ends with explicit manual verification in `npm run dev` plus `npm run lint` and, where noted, `npm run build`. Do not add a test framework.
- All site copy lives in `src/app/PORTFOLIO.ts`. Never hardcode names, dates, job text, or stack names into a component. `PORTFOLIO.ts` must not be modified by this plan at all — it holds the owner's hand-edited content.
- Dark, minimal, single teal accent. Cards are `bg-slate-800` on a `bg-slate-900` page. Stack pills are exactly `rounded-full bg-teal-400/10 px-3 py-1 text-xs font-medium leading-5 text-teal-300`. Hover turns titles `text-teal-300`.
- Every motion effect must be gated on reduced motion. `useRail()` already returns `reduceMotion`; use it rather than calling `useReducedMotion()` again.
- The Projects section must look and behave **exactly** as it does now. Changes to `useRail` are shared with it — any Projects regression is a failure.
- Arrow buttons are functionally load-bearing in **both** modes: every vertical wheel event over a scroller is forwarded to the page, so they are the only wheel-free way to scroll. Never remove them.
- Path alias `@/*` maps to `src/*`.
- The work stays **uncommitted and unstaged** unless a task's final step says otherwise. Do not run `git add` or `git commit`.

---

### Task 1: The switch and the mode it controls

Adds the state, its persistence, and the control — before either view reacts to it. At the end of this task the switch works and remembers itself; the section still renders the rail in both positions.

**Files:**
- Create: `src/utils/useViewMode.ts`
- Create: `src/app/_components/ViewSwitch.tsx`
- Modify: `src/app/_components/Timeline.tsx` (add a header row)
- Modify: `src/app/page.tsx` (remove the Experience `<h2>`)

**Interfaces:**
- Consumes: nothing.
- Produces: `useViewMode()` — default export returning `{ mode: ViewMode, toggle: () => void }`, where `type ViewMode = 'line' | 'rail'` is a named export. `ViewSwitch` — default export, props `{ mode: ViewMode; onToggle: () => void; reduceMotion: boolean }`. Tasks 3 and 4 branch on `mode`.

- [ ] **Step 1: Create the mode hook**

Create `src/utils/useViewMode.ts`:

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react';

export type ViewMode = 'line' | 'rail';

const STORAGE_KEY = 'experience-view-mode';

/**
 * The Experience section's view mode, persisted across visits.
 *
 * Always starts at 'line' — on the server and on the client's first paint —
 * so the markup React hydrates matches what the server sent. A stored
 * preference is applied one frame later from the effect. A returning visitor
 * therefore sees line mode for a single frame before their choice takes
 * effect; that is the deliberate cost of not risking a hydration mismatch.
 */
const useViewMode = () => {
  const [mode, setMode] = useState<ViewMode>('line');
  const hydrated = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'line' || stored === 'rail') setMode(stored);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    // Skip the mount pass so we never write the default back over a stored
    // preference before the read effect above has run.
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((current) => (current === 'line' ? 'rail' : 'line'));
  }, []);

  return { mode, toggle };
};

export default useViewMode;
```

- [ ] **Step 2: Create the switch**

Create `src/app/_components/ViewSwitch.tsx`:

```tsx
'use client'

import { FC } from 'react';
import { motion } from 'motion/react';
import { ViewMode } from '@/utils/useViewMode';

interface ViewSwitchProps {
  mode: ViewMode;
  onToggle: () => void;
  reduceMotion: boolean;
}

const ViewSwitch: FC<ViewSwitchProps> = ({ mode, onToggle, reduceMotion }) => {
  const isRail = mode === 'rail';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isRail}
      onClick={onToggle}
      aria-label="Experience view: timeline or rail"
      className="group flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
    >
      <span className="relative block h-[18px] w-8 rounded-full bg-white/15 transition-colors group-hover:bg-white/25">
        <motion.span
          className="absolute top-[2.5px] left-[2.5px] block h-[13px] w-[13px] rounded-full bg-teal-300"
          animate={{ x: isRail ? 14 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
      <span className="font-mono text-[10px] tracking-widest text-gray-400 transition-colors group-hover:text-teal-300">
        {isRail ? 'RAIL' : 'LINE'}
      </span>
    </button>
  );
};

export default ViewSwitch;
```

- [ ] **Step 3: Add the header row to Timeline**

In `src/app/_components/Timeline.tsx`:

Add these imports alongside the existing ones:

```tsx
import useViewMode from '@/utils/useViewMode';
import ViewSwitch from './ViewSwitch';
```

Add this line directly below the existing `useRail()` destructuring:

```tsx
  const { mode, toggle } = useViewMode();
```

Then, immediately inside the outermost `<div className="flex h-full w-full flex-col">`, before the scroller's wrapper div, insert:

```tsx
      <header className="flex shrink-0 items-center gap-4 py-4">
        <h2 className="text-4xl tracking-tight">Experience</h2>
        <ViewSwitch mode={mode} onToggle={toggle} reduceMotion={!!reduceMotion} />
      </header>
```

- [ ] **Step 4: Remove the heading from page.tsx**

`Timeline` now owns the heading. In `src/app/page.tsx`, Section 2, replace:

```tsx
            <h2 className="text-4xl tracking-tight shrink-0 py-4">Experience</h2>
            <div className="min-h-0 flex-1">
              <Timeline />
            </div>
```

with:

```tsx
            <div className="min-h-0 flex-1">
              <Timeline />
            </div>
```

Only the `<h2>` line goes. Keep the wrapper and its sizing classes exactly as they are — `Timeline` is `h-full` and needs that definite height to size cards against.

Leave Section 3 (Projects) and its `<h2>` exactly as they are — the two sections are deliberately asymmetric now.

- [ ] **Step 5: Verify**

Run: `npm run dev`, scroll to Experience. Check:
- The heading reads "Experience" at the same size as before, with the pill switch immediately to its right.
- Clicking the switch slides the knob across and the label alternates `LINE` / `RAIL`. Nothing else changes yet — that is correct at this stage.
- Reload the page: the switch is in the position you left it.
- Tab to the switch: it takes focus with a visible ring, Space and Enter both flip it.
- The rail below still scrolls, and its arrows still work.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors.

---

### Task 2: Give the scroller a content wrapper

Line mode needs a line element spanning the full scroll content. An absolutely positioned child of the scroller would only span the *visible* width, because a scroll container's padding box is its containing block. The fix is an inner wrapper sized by the cards, which becomes the positioning context. This task adds it with no visible change.

**Files:**
- Modify: `src/app/_components/Timeline.tsx`
- Modify: `src/utils/useRail.ts`

**Interfaces:**
- Consumes: `useRail` from the rail work.
- Produces: the Timeline scroller now contains exactly one child element, the content wrapper, which holds the cards. `useRail`'s `scrollByCard` reads its gap from the cards' parent rather than from the scroller. Task 3 positions the line inside this wrapper.

- [ ] **Step 1: Read the gap from the cards' parent**

`scrollByCard` currently reads `columnGap` off the scroller. With a content wrapper the gap lives on the wrapper, so the scroller reports `0` and the step collapses to the card width, silently under-scrolling by one gap.

In `src/utils/useRail.ts`, inside `scrollByCard`, replace:

```ts
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
```

with:

```ts
    // The gap lives on whichever element actually lays the cards out — the
    // scroller itself in Projects, an inner content wrapper in Experience
    // (which needs a content-sized positioning context for its timeline line).
    const gap = parseFloat(getComputedStyle(card?.parentElement ?? el).columnGap) || 0;
```

This is correct for Projects too, where the cards' parent *is* the scroller.

- [ ] **Step 2: Wrap the cards**

In `src/app/_components/Timeline.tsx`, move the layout classes off the scroller and onto a new inner wrapper. Replace the scroller element and its card map:

```tsx
        <div
          ref={railRef}
          onScroll={sync}
          role="region"
          aria-label="Experience"
          tabIndex={0}
          className="rail-scroller flex h-full max-h-[26rem] w-full snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain md:gap-6"
        >
          {TimelineData.map((job, i) => (
```

with:

```tsx
        <div
          ref={railRef}
          onScroll={sync}
          role="region"
          aria-label="Experience"
          tabIndex={0}
          className="rail-scroller h-full max-h-[26rem] w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        >
          {/*
            The cards' layout lives on this wrapper, not the scroller, so that
            it is sized by its content rather than by the viewport. That makes
            it the right positioning context for the timeline line, which must
            span the whole scrollable width — an absolute child of the scroller
            would only span the visible part.
          */}
          <div className="relative flex h-full min-w-full gap-4 md:gap-6">
          {TimelineData.map((job, i) => (
```

and add one closing `</div>` after the card map's closing `))}`, before the scroller's own `</div>`.

- [ ] **Step 3: Verify nothing changed**

Run: `npm run dev`, scroll to Experience. Check:
- Cards are the same size and position as before this task.
- Dragging and swiping scroll the rail; the teal axis fill still tracks position.
- **Arrow buttons still advance exactly one card** — this is the specific thing Step 1 protects. Click the right arrow repeatedly from the start and confirm each click lands the next card flush at the left edge, with no creeping drift.
- Check the Projects section too: its arrows must still advance exactly one card.

- [ ] **Step 4: Lint and build**

Run: `npm run lint && npm run build`
Expected: both pass.

---

### Task 3: Line mode

Builds the restored timeline layout — alternating cards, a centre line, a dot per job — switching instantly. The morph comes in Task 4.

**Files:**
- Modify: `src/app/_components/TimelineCard.tsx`
- Modify: `src/app/_components/Timeline.tsx`

**Interfaces:**
- Consumes: `ViewMode` from Task 1, the content wrapper from Task 2.
- Produces: `TimelineCard` gains a `mode: ViewMode` prop. In line mode it renders its own dot, absolutely positioned on the centre line at the card's horizontal centre. Task 4 attaches `layout` and `layoutId` to these elements.

> **Geometry — the numbers must agree or the dots will not sit on the line.** In line mode the content wrapper is 26rem (416px) tall. Cards are `h-48` (192px). A card aligned to the top occupies 0–192; the centre line sits at 208; so the gap is 16px and a dot centred on the line is 20px below the card's bottom edge (16px gap + half of the 8px dot). A card aligned to the bottom occupies 224–416, and its dot is 20px above its top edge. Changing the wrapper height or the card height means recomputing the 20px offset.

- [ ] **Step 1: Teach the card about mode**

In `src/app/_components/TimelineCard.tsx`:

Add to the imports:

```tsx
import { ViewMode } from '@/utils/useViewMode';
```

Add this field to `TimelineCardProps`:

```tsx
  mode: ViewMode;
```

Add `mode` to the destructured props in the component signature.

Directly above the `return`, add:

```tsx
  const isLine = mode === 'line';
  // nth-child(odd) sat above the line in the original CSS, and nth-child is
  // 1-based — so even indices are the ones that go above.
  const above = index % 2 === 0;
```

- [ ] **Step 2: Apply the line-mode geometry**

Still in `TimelineCard.tsx`, change the outer `motion.div`'s `className` from:

```tsx
      className={(className ?? '') + ' overflow-hidden rounded-lg bg-slate-800 shadow-lg hover:shadow-xl'}
```

to:

```tsx
      className={
        (className ?? '') +
        ' rounded-lg bg-slate-800 shadow-lg hover:shadow-xl ' +
        (isLine
          ? 'relative h-48 ' + (above ? 'self-start' : 'self-end')
          : 'overflow-hidden self-stretch')
      }
```

Note `overflow-hidden` is dropped in line mode — the dot is positioned outside the card's box and would be clipped by it.

Then change the description paragraph's clamp so line mode shows less:

```tsx
        <p className={
          'mt-3 min-h-0 text-base leading-7 text-gray-300 transition-colors group-hover/item:text-white ' +
          (isLine ? 'line-clamp-3' : 'line-clamp-6')
        }>
          {job.content}
        </p>
```

- [ ] **Step 3: Give the card its dot**

Still in `TimelineCard.tsx`, immediately after the closing `</div>` of the inner `group/item` wrapper and before the closing `</motion.div>`, add:

```tsx
      {isLine && (
        <span
          aria-hidden
          className="absolute left-1/2 block h-2 w-2 -translate-x-1/2 rounded-full bg-[#01565b]"
          // 16px gap to the line + half the dot: the dot's centre lands on the line.
          style={above ? { bottom: -20 } : { top: -20 }}
        />
      )}
```

- [ ] **Step 4: Branch the Timeline layout**

In `src/app/_components/Timeline.tsx`:

Add below the existing `active` derivation:

```tsx
  const isLine = mode === 'line';
```

Give the content wrapper its line-mode height and alignment. Change:

```tsx
          <div className="relative flex h-full min-w-full gap-4 md:gap-6">
```

to:

```tsx
          <div className={
            'relative flex min-w-full gap-4 md:gap-6 ' +
            (isLine ? 'h-[26rem] items-start' : 'h-full items-stretch')
          }>
```

Immediately inside that wrapper, before the card map, add the line itself:

```tsx
            {isLine && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-1/2 block h-px -translate-y-1/2 bg-white/50"
              />
            )}
```

Pass `mode` to each card by adding this prop inside the `<TimelineCard ... />` call:

```tsx
              mode={mode}
```

- [ ] **Step 5: Hide the axis in line mode**

The axis belongs to rail mode; in line mode the line and dots are up in the scroller and the bottom row holds only the arrows.

In the bottom row, find the axis block — the `<div className="relative flex-1 pb-8">` element together with the track, the teal fill, and the `TimelineData.map` of dot buttons inside it. Do not edit its contents. Wrap that whole element in a conditional so it renders only in rail mode, with a plain spacer in its place otherwise:

- Immediately **before** `<div className="relative flex-1 pb-8">`, insert: `{isLine ? <div className="flex-1" /> : (`
- Immediately **after** that element's matching closing `</div>`, insert: `)}`

The spacer keeps the arrows pinned right in both modes. Leave the arrows block that follows untouched — they are load-bearing in line mode too.

- [ ] **Step 6: Verify line mode**

Run: `npm run dev`, scroll to Experience, make sure the switch reads `LINE`. Check:
- A hairline runs horizontally through the middle of the card area, spanning the full scrollable width — scroll right and confirm it continues under the last card rather than stopping at the viewport edge.
- Cards alternate: first above the line, second below, third above, fourth below.
- Every card is the same height, and a dark green dot sits **centred on the line** beneath each above-card and above each below-card. If the dots float off the line, re-check the geometry note at the top of this task.
- Descriptions clamp to three lines; stack pills are visible on every card.
- Flip to `RAIL`: the previous rail view returns intact — one baseline, taller cards, the axis with year labels and ticks, arrows to the right.
- Flip back and forth several times; both layouts stay correct.
- Arrows scroll one card per click in **both** modes.

- [ ] **Step 7: Lint and build**

Run: `npm run lint && npm run build`
Expected: both pass.

---

### Task 4: The morph

Turns the instant swap into the transition: cards travel and expand, the line slides down and becomes the axis, the dots turn teal and shrink into ticks.

**Files:**
- Modify: `src/app/_components/TimelineCard.tsx`
- Modify: `src/app/_components/Timeline.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: nothing consumed elsewhere.

> **How the two mechanisms differ, and why both are needed.** Cards never unmount — the same DOM node is in both layouts — so they use `layout`, which measures the element before and after a re-render and animates the difference. The line and the dots *do* change parent: in line mode they live inside the scroller, in rail mode the axis sits below it. An element cannot animate across an unmount, so those pairs use a shared `layoutId`, which lets Framer treat the unmounting element and the mounting one as the same thing. Do not try to make the line use `layout` — it will jump.

- [ ] **Step 1: Set one transition for the whole section**

In `src/app/_components/Timeline.tsx`, add `MotionConfig` to the `motion/react` import:

```tsx
import { MotionConfig } from 'motion/react';
```

Wrap the component's entire returned JSX in:

```tsx
    <MotionConfig
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 420, damping: 38 }
      }
    >
      {/* ...existing outermost <div className="flex h-full w-full flex-col"> ... */}
    </MotionConfig>
```

This is the reduced-motion opt-out for every layout animation below it, and it is why individual elements in this task specify no transition of their own.

- [ ] **Step 2: Make the cards travel**

In `src/app/_components/TimelineCard.tsx`, add the `layout` prop to the outer `motion.div`, just above `data-rail-card`:

```tsx
      layout={!reduceMotion}
```

Leave the existing `whileHover` and `animate` props as they are. Step 5 replaces this element's `transition` prop so that the hover spring and the layout animation can be tuned independently — do not delay the whole element, or the hover lift and the sibling-dim inherit the delay too.

- [ ] **Step 3: Morph the line into the axis track**

The line element and the axis track become the same animating object.

In `Timeline.tsx`, change the line from a `<span>` to a motion element with a shared id:

```tsx
            {isLine && (
              <motion.span
                layoutId="experience-line"
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-1/2 block h-px -translate-y-1/2 bg-white/50"
              />
            )}
```

Then, in the rail-mode axis, change the track element from:

```tsx
          <div aria-hidden className="relative h-px w-full rounded-full bg-white/10">
```

to:

```tsx
          <motion.div layoutId="experience-line" aria-hidden className="relative h-px w-full rounded-full bg-white/10">
```

Add `motion` to the `motion/react` import in `Timeline.tsx` if it is not already there.

- [ ] **Step 4: Morph the dots into the ticks**

In `TimelineCard.tsx`, change the dot to a motion element carrying a per-job id:

```tsx
      {isLine && (
        <motion.span
          layoutId={`experience-tick-${index}`}
          aria-hidden
          className="absolute left-1/2 block h-2 w-2 -translate-x-1/2 rounded-full bg-[#01565b]"
          style={above ? { bottom: -20 } : { top: -20 }}
        />
      )}
```

In `Timeline.tsx`, inside each axis dot button there is a `<span>` whose className begins `'-mt-[2.5px] block h-1.5 w-1.5 rounded-full ...'` — the tick itself, not the year label below it. Make exactly two edits to it and nothing else:

1. Change its opening tag from `<span` to `<motion.span`, and its closing `/>` stays as it is (it is self-closing).
2. Add `layoutId={`experience-tick-${i}`}` as its first attribute.

Leave its entire `className` expression untouched, including the `reduceMotion` branch and the active/inactive colour branch. The index variable in this map is `i`, matching the `index` used on the card side so the two ids pair up.

- [ ] **Step 5: Let the line lead**

The line should start ~80ms before the cards. The delay must apply to the **layout** animation only — putting it on the whole element would also delay the hover lift and the sibling-dim, making the card feel unresponsive to the pointer.

Framer accepts per-property transitions, so replace the existing `transition` prop on `TimelineCard.tsx`'s outer `motion.div` with:

```tsx
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              // hover lift and opacity dim — unchanged from before
              type: 'spring',
              stiffness: 300,
              damping: 24,
              // the mode morph: 80ms behind the line, then 25ms per card
              layout: {
                type: 'spring',
                stiffness: 420,
                damping: 38,
                delay: 0.08 + index * 0.025
              }
            }
      }
```

- [ ] **Step 6: Verify the morph**

Run: `npm run dev`, scroll to Experience. Flip the switch and watch closely. Check:
- Cards **travel and grow** — they do not fade out and fade in. Watch one card's title: it should stay legible and move continuously to its new position.
- The line slides from the centre down to the axis row rather than disappearing and reappearing.
- The dots move to the axis, turning teal and shrinking as they go.
- The year labels fade in under the ticks as the axis arrives.
- Flipping back reverses it; nothing is left stranded mid-screen.
- Flip rapidly five or six times: no card ends up in the wrong place, and nothing accumulates offset.
- Scroll the rail halfway along, then flip. The morph may be less tidy from a scrolled position — note what you see, but treat only stranded or mispositioned elements as defects.

- [ ] **Step 7: Verify the reduced-motion opt-out**

Enable System Settings → Accessibility → Display → Reduce motion, then reload.
Expected: the switch changes the view **instantly**, with no travel, no growth, and no fading. Both layouts still render correctly.

- [ ] **Step 8: Lint and build**

Run: `npm run lint && npm run build`
Expected: both pass.

> **If the dot morph misbehaves** — dots flying from odd corners, or leaving ghosts — the fallback is to drop `layoutId` from the dot pair only (Step 4, both halves), leaving them to appear and disappear while the line and cards still morph. Do this only if the behaviour cannot be corrected, and say so in the report; the line and card morphs are the load-bearing parts of the effect.

---

### Task 5: Verification sweep

Walk the spec's acceptance list end to end before calling this done.

**Files:**
- Modify: only if a check fails.

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Run the full list**

Run: `npm run dev` and verify each:

1. The section loads in line mode: hairline through the centre, cards alternating above and below, a dot per job on the line.
2. The switch sits beside "Experience", is keyboard reachable, and announces its state to a screen reader as a switch that is on or off.
3. Flipping to rail morphs as described; flipping back reverses it.
4. The choice survives a page reload.
5. Both modes scroll horizontally; arrows advance one card in both; a vertical wheel over either scrolls the page and snaps between sections.
6. The section fits an 800px-tall viewport without clipping in either mode.
7. Card links work in both modes: hover dims siblings and turns the title teal, and the external-link icon flies away before the link opens.
8. With `prefers-reduced-motion: reduce`, the swap is instant.
9. The Projects section is unchanged — cards, counter, progress bar, arrows, fade, focus-scroll.
10. The hero section is untouched.

- [ ] **Step 2: Check narrow viewports**

In DevTools, check 375px, 768px, 1080px, and 1440px in **both** modes.
Expected: card widths step at 768px and 1080px; in line mode the dots stay on the line at every width; nothing overflows horizontally; the switch stays beside the heading and does not wrap.

- [ ] **Step 3: Confirm no dead code**

Run: `grep -rn "setEqualHeights\|timeline-item\|Timeline.css" src/`
Expected: no output.

- [ ] **Step 4: Final lint and build**

Run: `npm run lint && npm run build`
Expected: both pass with no new warnings.
