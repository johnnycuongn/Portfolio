# Site Polish — Review & Design (2026-08-05)

Reviewer pass over the portfolio ("resume as a visual presentation"), followed by a
polish implementation. Design direction per CLAUDE.md: creative but minimal — refine,
don't add; dark + single teal accent; subtle playful motion.

## Review findings

### Bugs / correctness

| # | Finding | Where |
|---|---------|-------|
| 1 | Geist Sans/Mono loaded as CSS variables but never applied — body renders in Arial | `layout.tsx` + `globals.css` |
| 2 | `next/head` `<Head>` used inside App Router layout (no-op; `src/app/icon.png` convention already serves the favicon) | `layout.tsx` |
| 3 | Deprecated `layout="fill"` on `next/image` + missing `sizes` (console warnings); `blurDataURL` points at the full-size remote PNG, which defeats the blur placeholder | `ProjectCard.tsx` |
| 4 | `var(--whtie)` typo (color silently falls back) | `Timeline.css` |
| 5 | Debug `console.log` calls fire on every scroll | `page.tsx` |
| 6 | Invalid utility classes: `w-max-screen`, `f-full`, `max-h-200`; `text-md` isn't a Tailwind class | `page.tsx`, `ProjectCard.tsx`, `Timeline.tsx` |
| 7 | ESLint warnings: `scrollToSection` recreated each render (effect dep), `isLastOdd` state derived from a constant prop via effect | `page.tsx`, `ProjectCard.tsx` |
| 8 | `'Emtpy'` fallback typo | `ProjectCard.tsx` |
| 9 | Content typos rendered on screen: "Responisble", "inlcuding" | `PORTFOLIO.ts` |
| 10 | `Secton1.tsx` dead file | `src/app` |
| 11 | Body background stays white (`--background`) behind the slate-900 main — white flash on overscroll/load | `globals.css` |

### Design / UX observations

- Typography is the single biggest win: Arial → Geist changes the whole feel at zero cost.
- Firefly (`MouseAndCat`) is `position: absolute`, so the site's "pet" only exists on the
  hero viewport; it also sits above content without `pointer-events: none`.
- Project-card hover (`scale: 1.005`) is imperceptible — hover feels dead compared to the
  timeline's sibling-dimming.
- Hero appears with no entrance — the page's motion personality only shows up on scroll.
- No `prefers-reduced-motion` handling anywhere.
- Section titles are `<span>`s; project/timeline cards are clickable `div`s (Timeline has a
  proper overlay `<a>`; ProjectCard doesn't).
- Metadata is minimal ("Personal website of Duc Nguyen") — weak link previews/SEO.

### Flagged for the owner (content — not changed by this pass)

- Hero description still says "A **junior** software engineer with 1+ years…" while the
  role was just updated to "Software Engineer"; it also says "specialising in React and
  Typescript" while the tech pills now lead with .NET. Worth a rewrite to match.
- Third timeline card clips off-screen; horizontal scroll is the intended design but there
  is no affordance beyond the thin scrollbar.
- Third project (QMDCL) is commented out with empty image/description — either fill it in
  or delete the entry.

## Approaches considered

1. **Bug-fix only** — safe but leaves the design wins (font, motion) on the table.
2. **Polish pass: fixes + typography + micro-motion (chosen)** — everything above plus
   Geist, hero entrance stagger, tactile card hover, site-wide firefly, reduced-motion
   support. No layout or structural redesign.
3. **Redesign elements (new hero layout, timeline rework)** — rejected: violates
   "refine, don't add", and content decisions (copy) belong to the owner.

## Design (what this pass changes)

- **Typography**: `globals.css` body uses `var(--font-geist-sans)` (Arial/Helvetica as
  fallback), body background `#0f172a` to kill the white flash; `::selection` tinted teal.
  Name and section titles get `tracking-tight`.
- **Semantics/a11y**: section titles become `<h2>`; ProjectCard gets an overlay `<a>`
  (same pattern as Timeline) so cards are real links; contact button gets an aria-label;
  copied-state feedback unchanged.
- **Motion** (all `motion/react`, small amplitude, springs):
  - Hero children stagger in on mount (fade + 12px rise, ~0.5s, 0.08s stagger).
  - Project cards hover: `y: -4` spring lift instead of `scale: 1.005`.
  - Firefly becomes `fixed` + `pointer-events-none` so it roams all three sections; it
    (and the entrance stagger) respect `useReducedMotion`.
- **Cleanup**: all correctness items in the table above; `next/image` gets `fill` +
  `sizes`; metadata description improved. `Secton1.tsx` deleted.
- **Untouched**: scroll/snap mechanics, timeline CSS layout, colors, copy in
  `PORTFOLIO.ts` except the two spelling errors.
