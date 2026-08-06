# In-page resume viewer

**Date:** 2026-08-06
**Status:** Approved, ready for implementation planning

## Problem

Two surfaces promise the resume — the nav "Resume" button (`main_navigations.tsx:49`) and
Firefly's resume answer (`_ai/fallback.ts:55`) — and both eject the visitor to Google Drive.
Leaving the site costs the design its frame, adds a load, and on a phone drops the reader into
Drive's viewer.

The resume should open on the page, in a dialog that reads as part of this site, and work the
same on a phone as on a laptop.

## Constraints

- Mobile browsers do not reliably render PDFs inline. iOS Safari shows page one or nothing in an
  `<iframe>`; Android Chrome usually offers a download. Anything built on native PDF embedding
  needs a second, worse implementation for phones.
- `page.tsx:137` runs a global scroll listener that snaps the window to section boundaries. Any
  scrollable overlay fights it.
- Content belongs in `PORTFOLIO.ts` (CLAUDE.md). Components read it directly.
- Design language: dark, one teal accent, no borders or boxes, generous whitespace, small-amplitude
  physics-y motion.

## Decisions

| Decision | Choice |
|---|---|
| Resume source | Self-hosted `public/resume.pdf`, committed to the repo |
| Rendering | Pre-rendered page images, generated locally with `pdftoppm` |
| Treatment | Bare white sheet on a dimmed, blurred page — no frame, no header |
| Entry points | Nav "Resume" button and Firefly's resume action |
| Page count | Driven by a generated manifest; one page today, N pages without a redesign |

Rejected: a native `<iframe>` (its chrome is the browser's grey toolbar, and it breaks on phones);
`pdfjs-dist` (~350KB lazily loaded, worker configuration under Next 15, and a visible render beat
on the interaction meant to feel instant); a framed panel in the chat's styling (adds the box the
design language avoids); a horizontal page rail (machinery a one-page document does not need).

## Look and behaviour

### Desktop

The page dims to `slate-900/80` under a 4px backdrop blur. A single white sheet drops and settles:
`y 26→0`, `scale .94→1`, `rotate −1.4°→0`, on the spring the chat panel already uses
(`type: 'spring', stiffness: 300, damping: 26`). Its shadow carries the firefly's glow —
`0 0 40px rgba(230,255,150,.10)`, the value at `FireflyChat.tsx:241`.

Chrome fades in ~380ms later, so the page lands first:

- a close `✕` in the **viewport** corner, not on the sheet, `text-gray-400 hover:text-teal-300`
- a **Download PDF** pill in the site's existing tag styling, `rounded-full bg-teal-400/10 text-teal-300`

After ~2.5s of stillness the chrome fades to `opacity: 0`; any pointer movement, scroll, or focus
change brings it back. It is only ever an opacity change — the buttons stay mounted, focusable, and
in the tab order throughout, so the fade is never a keyboard trap. Dismiss with `Esc`, the `✕`, or a
click on the dimmed area.

**Click to zoom.** The default is fit-height, whole page visible — that is the aesthetic. But an A4
fitted to a 900px-tall window renders 10pt type at roughly 7px, which is readable in principle and
tiring in practice. So the sheet carries `cursor: zoom-in`; clicking it widens the page to
`min(92vw, 820px)` and lets the dialog scroll, `cursor: zoom-out` returns to fit-height. One
boolean, two size classes, both the glance and the read.

`prefers-reduced-motion` replaces the drop, rotation, and scale with a plain fade.

### Phone

The sheet spans the full viewport width less an 8px gutter each side, and the dialog scrolls
vertically past it. Fitting a whole A4 to a phone screen makes resume type unreadable;
fit-width-and-scroll is the only honest choice. Click-to-zoom does not apply here — the page is
already at full width, and pinch handles the rest.

Pinch-zoom already works — `layout.tsx` sets no viewport meta, so Next's default
(`width=device-width, initial-scale=1`) leaves zooming enabled. Nothing to change.

Chrome never auto-hides here. The `✕` stays top-right and the download pill floats bottom-centre on
a solid chip so it stays legible against white paper. The firefly beacon hides while the viewer is
open so it does not sit over the page.

**No swipe-to-dismiss.** The sheet must scroll vertically to be readable and a drag gesture fights
that scroll, leaving it dismissable only from the very top. `✕` and tap-outside already work.

### Scroll locking

`overflow: hidden` on the body stops window scroll without changing `scrollY`, so nothing jumps on
open or close. The snap listener also bails while the viewer is open — the same shape as the
existing `keyboardInset > 0` guard at `page.tsx:99` — which covers iOS ignoring the body lock for
touch scrolling. The dialog's scroll area sets `overscroll-behavior: contain` so scrolling does not
chain to the page.

## Architecture

### Pipeline

```
public/resume.pdf
  └─ npm run resume  (scripts/build-resume.ts → pdftoppm -png -r 200)
       ├─ public/resume/page-1.png … page-N.png     (committed)
       └─ src/app/_resume/pages.ts                  (generated manifest)
            └─ ResumeViewer maps it → next/image → WebP/AVIF at request time
```

The manifest exports `RESUME_PAGES: { src: string; width: number; height: number }[]`. Page count is
never hardcoded: replacing the PDF, re-running, and committing is the whole update path. `pdftoppm`
zero-pads its output names once a document passes nine pages, so the script normalizes filenames to
`page-N.png` and the manifest — not a filename convention — is what the viewer reads.

`next/image` handles format conversion and responsive resizing, which keeps the build script a thin
`pdftoppm` wrapper with no image-encoding dependency. The manifest's explicit dimensions prevent
layout shift.

Regeneration is a **manual local step, not part of `next build`** — Vercel's build container has no
poppler, so the rendered PNGs are committed. 200dpi is the starting resolution (A4 → 1654×2339);
tune down to 150 if repo weight matters more than crispness.

### New files

| File | Purpose |
|---|---|
| `public/resume.pdf` | The real PDF: download target and last-resort open |
| `public/resume/page-N.png` | Generated page images, committed |
| `src/app/_resume/pages.ts` | Generated manifest. Header comment marks it do-not-edit |
| `scripts/build-resume.ts` | Rasterizes the PDF and writes the manifest. Wired as `npm run resume` |
| `scripts/check-resume.ts` | Asserts the PDF exists and the manifest matches disk. Joins `npm run check` |
| `src/app/_components/ResumeViewer.tsx` | The dialog. Mounted once in `page.tsx` |
| `src/utils/useResumeViewer.tsx` | Context, provider, and `{ isOpen, open, close }` |
| `src/utils/useFocusTrap.ts` | Extracted from `FireflyChat`; used by both |

The two triggers live in different subtrees — the nav is inside `MainSections`, the chat is a
sibling — so they need shared state. `@reduxjs/toolkit` is a dependency but no store is wired
anywhere; a context is the right size for one boolean.

### Modified files

| File | Change |
|---|---|
| `PORTFOLIO.ts` | `resume_link` (Drive) is replaced by a `resume` object holding the PDF path and every string the dialog shows |
| `main_navigations.tsx:49` | `handleResumeClick` calls `open()` instead of `openInNewTab`; add `aria-haspopup="dialog"`, retitle |
| `_ai/types.ts` | `ChatAction` becomes `{ label, href?: string, opens?: 'resume' }` |
| `_ai/fallback.ts:55` | Resume action becomes `{ label: 'Open resume', opens: 'resume' }` |
| `_ai/knowledge.ts:20` | Stop feeding the model a Drive URL; state that the resume opens on the page |
| `FireflyChat.tsx` | Render `<button>` for `opens` and `<a>` for `href`; use `useFocusTrap`; hide the beacon while the viewer is open |
| `page.tsx` | Mount the provider and `<ResumeViewer/>`; bail the snap listener while open |
| `scripts/check-fallback.ts:37` | Assert on `action?.opens === 'resume'` instead of the `https://` href |
| `scripts/check-knowledge.ts:19` | Assert on the new resume phrasing instead of `PORTFOLIO.resume_link` |

Both guard scripts currently assert on the Drive link and will fail `npm run check` unless updated
in the same change. The AI layer is genuinely in scope, not a drive-by edit.

## Accessibility

- `role="dialog"`, `aria-modal="true"`, label from `PORTFOLIO.resume`
- Focus moves to the close button on open and returns to the triggering element on close
- Tab is trapped by `useFocusTrap`, extracted from the existing implementation at
  `FireflyChat.tsx:155-169` rather than duplicated
- `Esc` closes, with `stopPropagation` as the chat panel does
- The page container gets `inert` while the dialog is open. React 19 supports it as a plain prop
- Alt text reads `Resume, page 1 of N`. A rasterized page gives a screen reader nothing else, so the
  Download PDF button is the real accessible path; it is never removed from the accessibility tree
  or the tab order, including while the chrome is faded out

## Error handling

- A page image that fails to load is replaced by a small slate panel carrying the Download PDF
  button, rather than leaving a blank white rectangle
- An empty manifest shows that same panel. `check-resume.ts` should prevent it shipping at all
- Before hydration the nav button does nothing. Every component on this site is `'use client'`;
  this is the existing behaviour and is not addressed here

## Out of scope

- Deep-linking (`#resume` or `?resume`). Hash changes interact badly with the snap-scrolling page
- Text selection and in-page search — the downloadable PDF covers both
- Print styles
- Desktop zoom beyond the single click-to-zoom toggle; no pan, no zoom percentage UI

## Success criteria

1. Clicking nav "Resume" opens the sheet in place; no navigation, no Google Drive
2. Firefly's resume answer opens the same viewer
3. On a phone the resume is readable at full width, scrolls, and pinch-zooms
4. Opening, reading, and closing the viewer never moves the page behind it to a different section
5. `Esc`, `✕`, and click-outside all close it, and focus returns to the trigger
6. Adding a second page requires only replacing the PDF and re-running `npm run resume`
7. `npm run check`, `npm run lint`, and `npm run build` all pass
