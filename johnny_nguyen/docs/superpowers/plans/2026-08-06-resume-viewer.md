# In-Page Resume Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Johnny's resume in a dialog on the page — a bare white sheet on a dimmed background — instead of sending visitors to Google Drive.

**Architecture:** `public/resume.pdf` is rasterized locally by `npm run resume` into `public/resume/page-N.png` plus a generated TypeScript manifest. A single `ResumeViewer` dialog maps that manifest through `next/image`. Open state lives in a React context because the two triggers — the nav button and Firefly's resume answer — sit in different subtrees.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, TailwindCSS 3, `motion/react`, `pdftoppm` (poppler, local only), `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-08-06-resume-viewer-design.md`

## Global Constraints

- **There is no test runner in this repo** and this plan does not add one. The project's native test idiom is assertion scripts under `scripts/` run by `npm run check` via `tsx`. Every task that can be asserted uses that cycle: extend a check script, watch it fail, implement, watch it pass. React components have no runner — their gate is `npm run lint`, `npm run build`, and the manual checks written into each task.
- **`npm run check` is red on master right now**, before any of this work: `scripts/check-knowledge.ts:94` reads `src/app/_ai/about-johnny.md`, which was renamed to `src/app/PORTFOLIO_AI_knowledge.md`. Task 0 repairs it. Do not start Task 1 until `npm run check` prints all six `ok` lines.
- **All copy lives in `src/app/PORTFOLIO.ts`** (CLAUDE.md). No user-visible string is hardcoded into a component.
- **Design language:** `bg-slate-900` page, `bg-slate-800` panels, teal is the only accent. Pills are `rounded-full bg-teal-400/10 px-3 py-1 text-xs text-teal-300`. Hover states go `text-teal-300`.
- **Motion:** the sheet spring is exactly `{ type: 'spring', stiffness: 300, damping: 26 }` — the same values as `FireflyChat.tsx:238`. The glow is exactly `0 0 40px rgba(230,255,150,0.10)`. Every animation has a `useReducedMotion()` branch that degrades to opacity alone.
- **Breakpoint:** the viewer steps at `md:` (768px), matching `useIsDesktop` in `src/utils/useIsDesktop.ts`. Where JS and CSS both need the breakpoint, they use that hook and `md:` so they cannot drift.
- **Rasterization is a local step, never part of `next build`.** Vercel has no poppler. Generated PNGs and the manifest are committed.
- `public/resume.pdf` already exists: 1 page, A4 (596×842pt), exported from Google Docs. It is currently untracked.

---

### Task 0: Repair the `npm run check` baseline

The knowledge file was renamed but two references were missed. Every later task gates on `npm run check`, so this has to go green first.

**Files:**
- Modify: `scripts/check-knowledge.ts:93-107`
- Modify: `next.config.ts:16-18`

**Interfaces:**
- Consumes: nothing
- Produces: a green `npm run check`, which every later task's gate depends on

- [ ] **Step 1: Run the check to see the failure**

Run: `npm run check`
Expected: FAIL with `Error: ENOENT: no such file or directory, open '.../src/app/_ai/about-johnny.md'` at `check-knowledge.ts:94`

- [ ] **Step 2: Point the check script at the renamed file**

In `scripts/check-knowledge.ts`, replace the block that currently reads:

```ts
const aboutPath = path.join(process.cwd(), 'src/app/_ai/about-johnny.md');
const aboutRaw = fs.readFileSync(aboutPath, 'utf8');
const aboutProse = extractKnowledgeProse(aboutRaw);
if (aboutProse) {
  assert.ok(
    prompt.includes('More about Johnny'),
    'about-johnny.md has prose, so the prompt should include the "More about Johnny" section',
  );
} else {
  assert.ok(
    !prompt.includes('More about Johnny'),
    'about-johnny.md is headings-only, so the prompt should not include an empty "More about Johnny" section',
  );
}
```

with:

```ts
const knowledgePath = path.join(process.cwd(), 'src/app/PORTFOLIO_AI_knowledge.md');
const knowledgeRaw = fs.readFileSync(knowledgePath, 'utf8');
const knowledgeProse = extractKnowledgeProse(knowledgeRaw);
if (knowledgeProse) {
  assert.ok(
    prompt.includes('More about Johnny'),
    'PORTFOLIO_AI_knowledge.md has prose, so the prompt should include the "More about Johnny" section',
  );
} else {
  assert.ok(
    !prompt.includes('More about Johnny'),
    'PORTFOLIO_AI_knowledge.md is headings-only, so the prompt should not include an empty "More about Johnny" section',
  );
}
```

Also update the comment above that block: any mention of `about-johnny.md` becomes `PORTFOLIO_AI_knowledge.md`.

- [ ] **Step 3: Point the serverless bundle at the renamed file**

In `next.config.ts`, change:

```ts
  outputFileTracingIncludes: {
    '/api/chat': ['./src/app/_ai/about-johnny.md'],
  },
```

to:

```ts
  outputFileTracingIncludes: {
    '/api/chat': ['./src/app/PORTFOLIO_AI_knowledge.md'],
  },
```

This one is not covered by any check — `/api/chat` reads the file at runtime, so without it the deployed chat silently loses its knowledge section.

- [ ] **Step 4: Run the check to verify it passes**

Run: `npm run check`
Expected: PASS — six lines, `check-content: ok` through `check-knowledge: ok`

- [ ] **Step 5: Commit**

```bash
git add scripts/check-knowledge.ts next.config.ts
git commit -m "fix: follow the knowledge file rename into the check script and bundle tracing"
```

---

### Task 1: Resume copy in `PORTFOLIO.ts`, guarded

**Files:**
- Modify: `src/app/PORTFOLIO.ts` (add `RESUME`, extend the export list)
- Create: `scripts/check-resume.ts`
- Modify: `package.json` (add `check-resume` to the `check` chain)

**Interfaces:**
- Consumes: nothing
- Produces: `RESUME` exported from `src/app/PORTFOLIO.ts`, with these exact keys — `pdf`, `navTitle`, `downloadLabel`, `closeLabel`, `dialogLabel`, `zoomInLabel`, `zoomOutLabel`, `pageAlt`, `errorMessage`. Every later task reads its strings from here.

Note: `PORTFOLIO.resume_link` stays for now. Two check scripts assert on it, and removing it in this task would leave the tree red. Task 8 removes it together with its consumers.

- [ ] **Step 1: Write the failing check**

Create `scripts/check-resume.ts`:

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RESUME } from '../src/app/PORTFOLIO';

// Every string the dialog puts on screen has to actually say something.
for (const [key, value] of Object.entries(RESUME)) {
  assert.equal(typeof value, 'string', `RESUME.${key} must be a string`);
  assert.ok(value.length > 0, `RESUME.${key} must not be empty`);
}

// The alt template carries both substitutions or pages lose their numbering.
assert.ok(RESUME.pageAlt.includes('{n}'), 'pageAlt needs an {n} placeholder');
assert.ok(RESUME.pageAlt.includes('{total}'), 'pageAlt needs a {total} placeholder');

// The PDF is served from public/, so the path is site-absolute and the file
// has to be on disk — it is the download target and the failure fallback.
assert.ok(RESUME.pdf.startsWith('/'), 'pdf must be a site-absolute path');
assert.ok(RESUME.pdf.endsWith('.pdf'), 'pdf must point at a PDF');
assert.ok(
  fs.existsSync(path.join(process.cwd(), 'public', RESUME.pdf)),
  `missing public${RESUME.pdf} — export the resume and drop it in`,
);

console.log('check-resume: ok');
```

- [ ] **Step 2: Wire it into the check chain**

In `package.json`, change the `check` script to append it:

```json
"check": "tsx scripts/check-content.ts && tsx scripts/check-fallback.ts && tsx scripts/check-storage.ts && tsx scripts/check-limits.ts && tsx scripts/check-knowledge.ts && tsx scripts/check-resume.ts"
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx tsx scripts/check-resume.ts`
Expected: FAIL — a TypeScript/module error along the lines of `'"../src/app/PORTFOLIO"' has no exported member named 'RESUME'`

- [ ] **Step 4: Add the `RESUME` object**

In `src/app/PORTFOLIO.ts`, immediately after the `PORTFOLIO` const and before `PROFILE_LINKS`:

```ts
/**
 * The resume as it appears on the page. The PDF is self-hosted and is both the
 * download target and the fallback if a page image will not render; the page
 * images beside it are generated from that PDF by `npm run resume`.
 */
const RESUME = {
  pdf: '/resume.pdf',
  navTitle: 'View my resume without leaving the page',
  downloadLabel: 'Download PDF',
  closeLabel: 'Close resume',
  dialogLabel: `${PORTFOLIO.name} — resume`,
  zoomInLabel: 'Zoom in to read',
  zoomOutLabel: 'Fit the whole page',
  /** `{n}` and `{total}` are substituted per page at render. */
  pageAlt: 'Resume, page {n} of {total}',
  /** Replaces the sheet when a page image fails to load. */
  errorMessage: 'The resume would not render here.',
};
```

Then extend the export line at the bottom of the file:

```ts
export { JobTimelineData as TimelineData, PORTFOLIO, PROFILE_LINKS, PROJECTS, CHAT, RESUME };
```

- [ ] **Step 5: Run the full check to verify it passes**

Run: `npm run check`
Expected: PASS, ending with `check-resume: ok`

- [ ] **Step 6: Commit**

```bash
git add src/app/PORTFOLIO.ts scripts/check-resume.ts package.json
git commit -m "feat: add resume viewer copy to PORTFOLIO with a content guard"
```

---

### Task 2: Rasterize the PDF and generate the page manifest

**Files:**
- Create: `scripts/build-resume.ts`
- Create (generated): `src/app/_resume/pages.ts`
- Create (generated): `public/resume/page-1.png`
- Modify: `package.json` (add the `resume` script)
- Modify: `scripts/check-resume.ts` (manifest assertions)

**Interfaces:**
- Consumes: `RESUME.pdf` from Task 1
- Produces: `src/app/_resume/pages.ts` exporting `interface ResumePage { src: string; width: number; height: number }` and `const RESUME_PAGES: ResumePage[]`. `src` is always `/resume/page-N.png`, numbered from 1 in document order. Task 4 renders from this.

- [ ] **Step 1: Confirm poppler is present**

Run: `pdftoppm -v`
Expected: prints a `pdftoppm version …` banner. If it is missing: `brew install poppler`.

- [ ] **Step 2: Write the failing manifest assertions**

First add the import at the top of `scripts/check-resume.ts`, beside the others:

```ts
import { RESUME_PAGES } from '../src/app/_resume/pages';
```

A static import is deliberate. `tsx` runs these scripts as CommonJS, so top-level `await` is not available, and importing a module that does not exist yet produces exactly the load failure this step is looking for.

Then append to the same file, above the final `console.log`:

```ts
// The generated manifest and what is actually on disk must agree — a stale
// manifest would render broken images in production. This cannot detect a PDF
// that changed without a re-run: git does not preserve mtimes, so comparing
// timestamps would be flaky rather than useful.
assert.ok(RESUME_PAGES.length > 0, 'no page images — run `npm run resume`');

const pageDir = path.join(process.cwd(), 'public/resume');
const onDisk = fs.readdirSync(pageDir).filter((name) => name.endsWith('.png'));
assert.equal(
  RESUME_PAGES.length,
  onDisk.length,
  'the manifest and public/resume disagree — re-run `npm run resume`',
);

RESUME_PAGES.forEach((page, index) => {
  assert.equal(page.src, `/resume/page-${index + 1}.png`, 'pages must be numbered from 1, in order');
  assert.ok(fs.existsSync(path.join(process.cwd(), 'public', page.src)), `missing public${page.src}`);
  assert.ok(page.width > 0 && page.height > 0, `${page.src} is missing its dimensions`);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx tsx scripts/check-resume.ts`
Expected: FAIL — `Cannot find module '.../src/app/_resume/pages'`

- [ ] **Step 4: Write the build script**

Create `scripts/build-resume.ts`:

```ts
/**
 * Rasterizes public/resume.pdf into page images and writes the manifest the
 * viewer reads.
 *
 *   npm run resume
 *
 * This is a local step, not part of `next build` — Vercel's build container has
 * no poppler — so its output is committed alongside the PDF.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A4 at 200dpi is 1654×2339 — enough for next/image to downscale crisply. */
const DPI = 200;

const ROOT = process.cwd();
const PDF = path.join(ROOT, 'public/resume.pdf');
const OUT_DIR = path.join(ROOT, 'public/resume');
const MANIFEST = path.join(ROOT, 'src/app/_resume/pages.ts');

/** PNG dimensions sit at a fixed offset inside the IHDR chunk, so reading the
 *  first 24 bytes avoids taking on an image library for two numbers. */
function pngSize(file: string): { width: number; height: number } {
  const header = Buffer.alloc(24);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, header, 0, 24, 0);
  fs.closeSync(fd);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

/** pdftoppm zero-pads its output once a document passes nine pages, so sort on
 *  the parsed number rather than the filename. */
function pageNumber(name: string): number {
  const match = name.match(/-(\d+)\.png$/);
  return match ? Number(match[1]) : 0;
}

if (!fs.existsSync(PDF)) {
  console.error('public/resume.pdf is missing. Export the resume and drop it in.');
  process.exit(1);
}

try {
  execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
} catch {
  console.error('pdftoppm not found. Install poppler:  brew install poppler');
  process.exit(1);
}

// Render into a scratch directory first so a failed run cannot leave a
// half-written public/resume behind.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
execFileSync('pdftoppm', ['-png', '-r', String(DPI), PDF, path.join(scratch, 'page')]);

const rendered = fs
  .readdirSync(scratch)
  .filter((name) => name.endsWith('.png'))
  .sort((a, b) => pageNumber(a) - pageNumber(b));

if (rendered.length === 0) {
  fs.rmSync(scratch, { recursive: true, force: true });
  console.error('pdftoppm produced no pages.');
  process.exit(1);
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const pages = rendered.map((name, index) => {
  const file = `page-${index + 1}.png`;
  const target = path.join(OUT_DIR, file);
  fs.copyFileSync(path.join(scratch, name), target);
  return { src: `/resume/${file}`, ...pngSize(target) };
});

fs.rmSync(scratch, { recursive: true, force: true });

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(
  MANIFEST,
  [
    '// Generated by `npm run resume` from public/resume.pdf. Do not edit.',
    '',
    'export interface ResumePage {',
    '  src: string;',
    '  width: number;',
    '  height: number;',
    '}',
    '',
    `export const RESUME_PAGES: ResumePage[] = ${JSON.stringify(pages, null, 2)};`,
    '',
  ].join('\n'),
);

console.log(`build-resume: ${pages.length} page(s) at ${DPI}dpi → public/resume/`);
```

- [ ] **Step 5: Add the npm script**

In `package.json`, add to `scripts`:

```json
"resume": "tsx scripts/build-resume.ts",
```

- [ ] **Step 6: Generate the pages**

Run: `npm run resume`
Expected: `build-resume: 1 page(s) at 200dpi → public/resume/`

Then confirm the output:

Run: `ls public/resume && head -20 src/app/_resume/pages.ts`
Expected: `page-1.png` exists, and the manifest lists it with roughly `width: 1654, height: 2339`.

- [ ] **Step 7: Run the check to verify it passes**

Run: `npm run check`
Expected: PASS, ending with `check-resume: ok`

- [ ] **Step 8: Commit**

```bash
git add scripts/build-resume.ts scripts/check-resume.ts package.json public/resume.pdf public/resume src/app/_resume/pages.ts
git commit -m "feat: rasterize the resume PDF into committed page images and a manifest"
```

---

### Task 3: Extract the focus trap out of `FireflyChat`

A second copy of this loop is exactly the kind of drift that leaves one dialog accessible and the other not. Pull it out before the resume viewer needs it. This task changes no behaviour.

**Files:**
- Create: `src/utils/useFocusTrap.ts`
- Modify: `src/app/_components/FireflyChat.tsx:148-170`

**Interfaces:**
- Consumes: nothing
- Produces: `useFocusTrap(containerRef: RefObject<HTMLElement | null>) => (event: KeyboardEvent) => void` — default export from `src/utils/useFocusTrap`. Task 4 uses it.

- [ ] **Step 1: Write the hook**

Create `src/utils/useFocusTrap.ts`:

```ts
'use client';

import { useCallback } from 'react';
import type { KeyboardEvent, RefObject } from 'react';

const FOCUSABLE = 'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Cycles Tab within an open overlay instead of letting it escape to the page
 * behind. Returns a keydown handler for the container; the caller owns Escape,
 * since what closing means differs per overlay.
 */
export default function useFocusTrap(containerRef: RefObject<HTMLElement | null>) {
  return useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !containerRef.current) return;

      const focusable = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [containerRef],
  );
}
```

- [ ] **Step 2: Adopt it in `FireflyChat`**

Add the import beside the other util imports at the top of `src/app/_components/FireflyChat.tsx`:

```ts
import useFocusTrap from '@/utils/useFocusTrap';
```

Then replace the whole `onPanelKeyDown` block (currently `FireflyChat.tsx:148-170`, from the `// Esc closes.` comment through the closing `}, []);`) with:

```ts
  const trapTab = useFocusTrap(panelRef);

  // Esc closes. Tab cycles within the panel rather than escaping to the page.
  const onPanelKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        return;
      }
      trapTab(event);
    },
    [trapTab],
  );
```

- [ ] **Step 3: Verify the build and lint are clean**

Run: `npm run lint && npm run build`
Expected: both PASS, no new warnings

- [ ] **Step 4: Verify the chat's trap still works by hand**

Run: `npm run dev`, open http://localhost:3000, click the firefly beacon in the bottom-right to open the chat.
Expected: pressing Tab repeatedly cycles only through the chat's own controls (Clear if present, close ✕, any chips, the input) and never reaches the nav buttons behind. Shift+Tab cycles backwards the same way. Escape closes the panel and focus returns to the beacon.

- [ ] **Step 5: Commit**

```bash
git add src/utils/useFocusTrap.ts src/app/_components/FireflyChat.tsx
git commit -m "refactor: lift the chat panel's focus trap into useFocusTrap"
```

---

### Task 4: The viewer — context, dialog, nav trigger

The core of the feature. After this task the nav "Resume" button opens the sheet in place.

**Files:**
- Create: `src/utils/useResumeViewer.tsx`
- Create: `src/app/_components/ResumeViewer.tsx`
- Modify: `src/app/page.tsx:36-46` (snap bail) and `:244-255` (mount)
- Modify: `src/app/_components/main_navigations.tsx:1-5, 49, 101-114`

**Interfaces:**
- Consumes: `RESUME` (Task 1), `RESUME_PAGES` (Task 2), `useFocusTrap` (Task 3)
- Produces:
  - `ResumeViewerProvider({ children })` — named export from `src/utils/useResumeViewer`
  - `useResumeViewer(): { isOpen: boolean; open: () => void; close: () => void }` — default export from the same file
  - `ResumeViewer` — default export from `src/app/_components/ResumeViewer`, takes no props, mounted once
  - Tasks 5, 6, 7 all edit `ResumeViewer.tsx`; Task 8 calls `useResumeViewer` from `FireflyChat`

- [ ] **Step 1: Write the context**

Create `src/utils/useResumeViewer.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface ResumeViewerState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const ResumeViewerContext = createContext<ResumeViewerState | null>(null);

export function ResumeViewerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);

  return <ResumeViewerContext.Provider value={value}>{children}</ResumeViewerContext.Provider>;
}

/**
 * The nav button and the firefly's resume answer both open the viewer, and they
 * sit in different subtrees, so the open state cannot live in either of them.
 */
export default function useResumeViewer(): ResumeViewerState {
  const context = useContext(ResumeViewerContext);
  if (!context) throw new Error('useResumeViewer must be used inside ResumeViewerProvider');
  return context;
}
```

- [ ] **Step 2: Write the dialog**

Create `src/app/_components/ResumeViewer.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RESUME } from '../PORTFOLIO';
import { RESUME_PAGES } from '../_resume/pages';
import useFocusTrap from '@/utils/useFocusTrap';
import useResumeViewer from '@/utils/useResumeViewer';

export default function ResumeViewer() {
  const { isOpen, close } = useResumeViewer();
  const reduceMotion = useReducedMotion();

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const trapTab = useFocusTrap(dialogRef);

  // Focus lands on the close button, and goes back to whatever opened the
  // viewer when it shuts — the nav button or the firefly's action.
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus({ preventScroll: true });
    } else {
      triggerRef.current?.focus({ preventScroll: true });
      triggerRef.current = null;
    }
  }, [isOpen]);

  // The page behind is a 300vh scroll container whose listener snaps to section
  // boundaries. Locking the body stops that scroll without touching scrollY, so
  // nothing jumps when the viewer closes.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      trapTab(event);
    },
    [close, trapTab],
  );

  const total = RESUME_PAGES.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={RESUME.dialogLabel}
          onKeyDown={onKeyDown}
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{ overscrollBehavior: 'contain' }}
          className="fixed inset-0 z-[300] overflow-y-auto bg-slate-900/80 backdrop-blur-sm"
        >
          <div className="flex min-h-full items-start justify-center p-2 md:items-center md:p-6">
            {/* The sheet stops the click that would otherwise close the dialog. */}
            <motion.div
              onClick={(event) => event.stopPropagation()}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.94, rotate: -1.4 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, rotate: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
              transition={
                reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 300, damping: 26 }
              }
              style={{ boxShadow: '0 26px 64px rgba(0,0,0,0.65), 0 0 40px rgba(230,255,150,0.10)' }}
              className="w-full space-y-3 md:w-auto"
            >
              {RESUME_PAGES.map((page, index) => (
                <Image
                  key={page.src}
                  src={page.src}
                  width={page.width}
                  height={page.height}
                  priority={index === 0}
                  alt={RESUME.pageAlt
                    .replace('{n}', String(index + 1))
                    .replace('{total}', String(total))}
                  className="h-auto w-full bg-white md:h-[88dvh] md:w-auto"
                />
              ))}
            </motion.div>
          </div>

          {/* The controls arrive after the page has landed, not with it. */}
          <motion.button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label={RESUME.closeLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.38, duration: 0.3 }}
            className="fixed right-4 top-4 text-xl leading-none text-gray-400 transition-colors hover:text-teal-300"
          >
            ✕
          </motion.button>

          <motion.a
            href={RESUME.pdf}
            download
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.38, duration: 0.3 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-teal-400/30 bg-slate-900/90 px-4 py-2 text-xs text-teal-300 transition-colors hover:bg-teal-400/20 md:left-auto md:right-6 md:translate-x-0 md:border-transparent md:bg-teal-400/10"
          >
            ↓ {RESUME.downloadLabel}
          </motion.a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Mount it and mark the page inert**

In `src/app/page.tsx`, add to the imports:

```ts
import ResumeViewer from "./_components/ResumeViewer";
import useResumeViewer, { ResumeViewerProvider } from "@/utils/useResumeViewer";
```

Replace the `Home` component at the bottom of the file:

```tsx
export default function Home() {
  return (
    <ResumeViewerProvider>
      <HomeShell />
    </ResumeViewerProvider>
  );
}

// The viewer sits outside <main> so that marking the page inert — which is what
// keeps a screen reader out of the dimmed page behind — cannot reach the dialog
// itself. React 19 takes `inert` as a plain boolean prop.
function HomeShell() {
  const { isOpen } = useResumeViewer();
  return (
    <div className="">
      <main className="bg-slate-900" inert={isOpen}>
        <MouseAndCat />
        <FireflyChat />
        <MainSections />
      </main>
      <ResumeViewer />
    </div>
  );
}
```

- [ ] **Step 4: Stop the snap while the viewer is open**

Still in `src/app/page.tsx`, inside `MainSections`, add beside the existing `useKeyboardInset` line (currently `page.tsx:46`):

```ts
  const { isOpen: resumeOpen } = useResumeViewer();
```

Then in the `snap` function, directly below the existing `keyboardInset` guard:

```ts
      // The resume viewer parks the page under a scrim. Locking the body stops
      // most scrolling, but iOS can still coast, and snapping the page under an
      // open dialog would move it out from under the reader.
      if (resumeOpen) return;
```

And add `resumeOpen` to that effect's dependency array, which becomes:

```ts
  }, [sectionHeight, reduceMotion, keyboardInset, resumeOpen])
```

- [ ] **Step 5: Point the nav button at the viewer**

In `src/app/_components/main_navigations.tsx`:

Change the imports — drop `openInNewTab`, which the resume was its only caller of, and pull in the new pieces:

```ts
import { PORTFOLIO, RESUME } from '../PORTFOLIO';
import useResumeViewer from '@/utils/useResumeViewer';
```

Inside `TabItem`, replace line 49:

```ts
  const handleResumeClick = () => openInNewTab(PORTFOLIO.resume_link);
```

with:

```ts
  const { open: openResume } = useResumeViewer();
  const handleResumeClick = () => openResume();
```

And replace the Resume `<button>` (currently `main_navigations.tsx:109-114`):

```tsx
          <button
            title={RESUME.navTitle}
            aria-haspopup="dialog"
            className="px-4 py-2 cursor-pointer"
          >
            {item}
          </button>
```

- [ ] **Step 6: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: both PASS. If lint flags `openInNewTab` as unused, its import was not removed in Step 5.

- [ ] **Step 7: Verify by hand**

Run: `npm run dev` and open http://localhost:3000.

Expected, on a desktop-width window:
1. Clicking "Resume" in the top-right dims and blurs the page; the sheet drops in with a small overshoot and settles.
2. The whole page is visible at once, roughly 88% of the window height.
3. `✕` fades in at the top-right of the window a beat after the sheet lands, and the teal Download PDF pill does the same at the bottom-right.
4. Escape closes it. Clicking the dimmed area closes it. `✕` closes it.
5. After closing, focus is back on the nav Resume button — press Enter and it reopens.
6. Tab while open cycles only between `✕` and Download PDF.
7. Download PDF saves `resume.pdf`.
8. Scrolling with the wheel while open does nothing to the page behind, and after closing, the page is still on the section it started on.

Then narrow the window below 768px (or use device emulation):
9. The sheet fills the width, and the dialog scrolls vertically to read down the page.
10. The download pill is centred at the bottom on a solid chip.
11. Closing leaves the page where it was.

- [ ] **Step 8: Commit**

```bash
git add src/utils/useResumeViewer.tsx src/app/_components/ResumeViewer.tsx src/app/page.tsx src/app/_components/main_navigations.tsx
git commit -m "feat: open the resume in a dialog on the page"
```

---

### Task 5: Failure fallback

A page image that 404s currently leaves a blank white rectangle with no way out but Escape.

**Files:**
- Modify: `src/app/_components/ResumeViewer.tsx`

**Interfaces:**
- Consumes: `RESUME.errorMessage`, `RESUME.downloadLabel`, `RESUME.pdf`
- Produces: nothing new

- [ ] **Step 1: Add the failure state**

In `src/app/_components/ResumeViewer.tsx`, add `useState` to the React import, then inside the component below the `trapTab` line:

```tsx
  // A page that will not load must not leave a blank white rectangle behind.
  // Reset on close so a transient failure does not stick for the session.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isOpen) setFailed(false);
  }, [isOpen]);

  const showFallback = failed || RESUME_PAGES.length === 0;
```

- [ ] **Step 2: Render the panel instead of the sheet when it fails**

Replace the contents of the inner `motion.div` — the `{RESUME_PAGES.map(...)}` block — with:

```tsx
              {showFallback ? (
                <div className="rounded-2xl bg-slate-800 px-6 py-8 text-center">
                  <p className="text-sm leading-6 text-gray-300">{RESUME.errorMessage}</p>
                  <a
                    href={RESUME.pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block rounded-full bg-teal-400/10 px-4 py-2 text-xs text-teal-300 transition-colors hover:bg-teal-400/20"
                  >
                    {RESUME.downloadLabel}
                  </a>
                </div>
              ) : (
                RESUME_PAGES.map((page, index) => (
                  <Image
                    key={page.src}
                    src={page.src}
                    width={page.width}
                    height={page.height}
                    priority={index === 0}
                    onError={() => setFailed(true)}
                    alt={RESUME.pageAlt
                      .replace('{n}', String(index + 1))
                      .replace('{total}', String(total))}
                    className="h-auto w-full bg-white md:h-[88dvh] md:w-auto"
                  />
                ))
              )}
```

Also drop the sheet's glow when the fallback is showing — a slate panel does not need a paper shadow. Change the wrapper's `style` to:

```tsx
              style={{
                boxShadow: showFallback
                  ? 'none'
                  : '0 26px 64px rgba(0,0,0,0.65), 0 0 40px rgba(230,255,150,0.10)',
              }}
```

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: both PASS

- [ ] **Step 4: Verify the failure path by hand**

Run: `npm run dev`, then temporarily rename the page image so it 404s:

```bash
mv public/resume/page-1.png public/resume/page-1.png.bak
```

Open http://localhost:3000 and click Resume.
Expected: a small dark slate panel reading "The resume would not render here." with a teal Download PDF button that opens the real PDF in a new tab. No blank white box.

Then put it back:

```bash
mv public/resume/page-1.png.bak public/resume/page-1.png
```

Reopen the viewer and confirm the sheet renders again.

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/ResumeViewer.tsx
git commit -m "feat: offer the PDF when a resume page image will not render"
```

---

### Task 6: Click to zoom on desktop

An A4 fitted to a 900px-tall window puts 10pt type at roughly 7px. Fit-height is the right default; it needs an escape.

**Files:**
- Modify: `src/app/_components/ResumeViewer.tsx`

**Interfaces:**
- Consumes: `useIsDesktop` from `src/utils/useIsDesktop`, `RESUME.zoomInLabel`, `RESUME.zoomOutLabel`
- Produces: nothing new

- [ ] **Step 1: Add the zoom state**

Add the import:

```ts
import useIsDesktop from '@/utils/useIsDesktop';
```

Then inside the component, below the `showFallback` line:

```tsx
  // Below md: the page is already full width and pinch-zoom handles the rest,
  // so the toggle only exists on desktop — where fit-height is otherwise too
  // small to read comfortably.
  const isDesktop = useIsDesktop();
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    if (!isOpen) setZoomed(false);
  }, [isOpen]);

  const canZoom = isDesktop && !showFallback;
```

- [ ] **Step 2: Make the sheet the zoom target**

On the inner `motion.div` (the sheet wrapper), replace the `onClick` and `className`:

```tsx
              onClick={(event) => {
                event.stopPropagation();
                if (canZoom) setZoomed((value) => !value);
              }}
              title={canZoom ? (zoomed ? RESUME.zoomOutLabel : RESUME.zoomInLabel) : undefined}
              className={`w-full space-y-3 md:w-auto ${
                canZoom ? (zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in') : ''
              }`}
```

- [ ] **Step 3: Swap the page sizing when zoomed**

On the `Image`, replace the `className` with:

```tsx
                    className={`h-auto w-full bg-white ${
                      zoomed ? 'md:w-[min(92vw,820px)]' : 'md:h-[88dvh] md:w-auto'
                    }`}
```

- [ ] **Step 4: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: both PASS

- [ ] **Step 5: Verify by hand**

Run: `npm run dev`, open http://localhost:3000 at desktop width, click Resume.
Expected:
1. The cursor over the sheet is a magnifier with a `+`.
2. Clicking the sheet widens it to a comfortable reading width; the dialog now scrolls vertically and the text is properly legible.
3. The cursor is now a magnifier with a `−`; clicking again returns to the whole page at 88% height.
4. Clicking the dimmed area beside the sheet still closes the dialog rather than zooming.
5. Closing and reopening starts back at fit-height.
6. Below 768px the sheet has a normal cursor and clicking it does nothing — the page is already full width.

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/ResumeViewer.tsx
git commit -m "feat: click the resume sheet to zoom it to a readable width"
```

---

### Task 7: Fade the chrome while reading

**Files:**
- Modify: `src/app/_components/ResumeViewer.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new

- [ ] **Step 1: Add the idle timer**

This replaces the fixed `delay: 0.38` entrance from Task 4 with one mechanism that owns both the arrival and the fade, so the two cannot fight each other.

Inside the component, below the zoom state:

```tsx
  // The ✕ and the download pill arrive a beat after the sheet lands, step back
  // while you read, and return the moment you move. The stepping back only
  // happens where there is a pointer to move: on a touch screen faded chrome
  // would never come back on its own.
  const [chromeVisible, setChromeVisible] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setChromeVisible(false);
      return;
    }

    const hasPointer = window.matchMedia('(hover: hover)').matches;
    let idle: NodeJS.Timeout | undefined;

    const wake = () => {
      setChromeVisible(true);
      if (!hasPointer) return;
      clearTimeout(idle);
      idle = setTimeout(() => setChromeVisible(false), 2500);
    };

    // Let the page land first.
    const entrance = setTimeout(wake, 380);

    window.addEventListener('pointermove', wake);
    window.addEventListener('focusin', wake);
    window.addEventListener('scroll', wake, { capture: true, passive: true });
    return () => {
      clearTimeout(entrance);
      clearTimeout(idle);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('focusin', wake);
      window.removeEventListener('scroll', wake, { capture: true });
    };
  }, [isOpen]);
```

- [ ] **Step 2: Drive both controls from it**

On the close button, replace the `animate` and `transition` props from Task 4:

```tsx
            animate={{ opacity: chromeVisible ? 1 : 0 }}
            transition={{ duration: chromeVisible ? 0.3 : 0.5 }}
```

On the download link, the same two props. Leave `initial={{ opacity: 0 }}` and both `className` values exactly as they are.

This is opacity alone — neither control is ever unmounted, hidden, or given `pointer-events: none`, so both stay in the tab order and in the accessibility tree even while invisible. That is what keeps the fade from becoming a keyboard trap.

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: both PASS

- [ ] **Step 4: Verify by hand**

Run: `npm run dev`, open http://localhost:3000, click Resume.
Expected:
1. `✕` and the pill still fade in a beat after the sheet lands — the entrance survived the rewrite.
2. Leaving the mouse alone for about two and a half seconds fades them out.
3. Any mouse movement brings them straight back.
4. With them faded, pressing Tab brings them back and focuses one of them — they are never unreachable by keyboard.
5. In device emulation with touch, they arrive on the same beat and then stay visible indefinitely.

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/ResumeViewer.tsx
git commit -m "feat: let the resume viewer's chrome step back while reading"
```

---

### Task 8: Point the firefly at the viewer and retire the Drive link

**Files:**
- Modify: `src/app/_ai/types.ts:8-11`
- Modify: `src/app/_ai/fallback.ts:54-58`
- Modify: `src/app/_ai/knowledge.ts:20`
- Modify: `src/app/PORTFOLIO.ts` (remove `resume_link`)
- Modify: `src/app/_components/FireflyChat.tsx` (action rendering, beacon)
- Modify: `scripts/check-fallback.ts:36-37`
- Modify: `scripts/check-knowledge.ts:19`

**Interfaces:**
- Consumes: `useResumeViewer` (Task 4)
- Produces: `ChatAction` becomes `{ label: string; href?: string; opens?: 'resume' }`

- [ ] **Step 1: Write the failing checks**

In `scripts/check-fallback.ts`, replace:

```ts
// The resume entry carries a link.
assert.ok(matchFallback('resume').action?.href.startsWith('https://'));
```

with:

```ts
// The resume entry opens the on-page viewer rather than navigating away.
assert.equal(matchFallback('resume').action?.opens, 'resume');
assert.equal(matchFallback('resume').action?.href, undefined, 'the resume answer must not carry a link');
```

In `scripts/check-knowledge.ts`, replace:

```ts
assert.ok(prompt.includes(PORTFOLIO.resume_link));
```

with:

```ts
// The model must know the resume is a thing on the page, not a URL it can hand
// out — there is no longer a link for it to give.
assert.ok(
  prompt.includes('The resume opens on this page'),
  'prompt must tell the model the resume opens in place',
);
```

- [ ] **Step 2: Run the checks to verify they fail**

Run: `npm run check`
Expected: FAIL — `check-fallback` trips first, on `action?.opens` being `undefined` rather than `'resume'`

- [ ] **Step 3: Widen `ChatAction`**

In `src/app/_ai/types.ts`, replace the interface:

```ts
export interface ChatAction {
  label: string;
  /** External destination. Mutually exclusive with `opens`. */
  href?: string;
  /** In-page target this button opens instead of navigating anywhere. */
  opens?: 'resume';
}
```

- [ ] **Step 4: Repoint the fallback answer**

In `src/app/_ai/fallback.ts`, replace the resume entry's action:

```ts
  {
    id: 'resume',
    triggers: ['resume', 'resumes', 'cv', 'pdf', 'download'],
    answer: 'Full resume is one click away.',
    action: { label: 'Open resume', opens: 'resume' },
  },
```

- [ ] **Step 5: Tell the model the resume is on the page**

In `src/app/_ai/knowledge.ts`, replace line 20:

```ts
    `Resume: ${PORTFOLIO.resume_link}`,
```

with:

```ts
    'The resume opens on this page — the Resume button in the top-right corner brings it up, and the dialog offers a PDF download. There is no link to hand out.',
```

- [ ] **Step 6: Remove the Drive link**

In `src/app/PORTFOLIO.ts`, delete the `resume_link` line from the `PORTFOLIO` object, and the trailing comma now left on the line above it:

```ts
  email: 'cuongdn2001@gmail.com'
}
```

- [ ] **Step 7: Render the in-page action as a button**

In `src/app/_components/FireflyChat.tsx`, add the import:

```ts
import useResumeViewer from '@/utils/useResumeViewer';
```

Inside the component, beside the other hooks:

```ts
  const { isOpen: resumeOpen, open: openResume } = useResumeViewer();
```

Replace the `{message.action && ( … )}` block (currently `FireflyChat.tsx:321-330`) with:

```tsx
                      {message.action &&
                        (message.action.opens === 'resume' ? (
                          <button
                            type="button"
                            onClick={openResume}
                            className="mt-1 inline-block text-xs text-teal-300 hover:underline"
                          >
                            {message.action.label} →
                          </button>
                        ) : (
                          <a
                            href={message.action.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block break-all text-xs text-teal-300 hover:underline"
                          >
                            {message.action.label} →
                          </a>
                        ))}
```

- [ ] **Step 8: Hide the beacon behind the viewer**

Still in `FireflyChat.tsx`, on the drifting beacon container (currently `FireflyChat.tsx:187-190`), add an `animate` prop — the firefly's glow reads through the scrim otherwise:

```tsx
      <motion.div
        style={{ x, y }}
        animate={{ opacity: resumeOpen ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-6 right-6 z-[200] flex h-11 items-center"
      >
```

- [ ] **Step 9: Run the checks to verify they pass**

Run: `npm run check`
Expected: PASS, all six scripts

- [ ] **Step 10: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: both PASS. A TypeScript error mentioning `resume_link` means a consumer was missed — search with `grep -rn "resume_link" src scripts`, which should return nothing.

- [ ] **Step 11: Verify by hand**

Run: `npm run dev`, open http://localhost:3000, click the firefly beacon, then the "Resume" chip.
Expected:
1. The firefly answers and offers "Open resume →".
2. Clicking it opens the viewer in place — no new tab, no Google Drive.
3. The beacon fades out while the viewer is open, and comes back on close.
4. Closing the viewer returns focus into the chat panel, with the chat still open behind where it was.
5. Asking "what's his cv like" gives the same offer.

- [ ] **Step 12: Commit**

```bash
git add src/app/_ai/types.ts src/app/_ai/fallback.ts src/app/_ai/knowledge.ts src/app/PORTFOLIO.ts src/app/_components/FireflyChat.tsx scripts/check-fallback.ts scripts/check-knowledge.ts
git commit -m "feat: open the resume viewer from the firefly and drop the Drive link"
```

---

### Task 9: Full verification pass

**Files:** none modified unless a check fails

**Interfaces:**
- Consumes: everything above
- Produces: a verified feature

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm run lint && npm run build`
Expected: all three PASS

- [ ] **Step 2: Confirm nothing still points at Drive**

Run: `grep -rn "drive.google.com\|resume_link" src scripts next.config.ts`
Expected: no matches

- [ ] **Step 3: Walk the success criteria on desktop**

Run: `npm run dev` and open http://localhost:3000 at full width.

- [ ] Nav "Resume" opens the sheet in place, dropping and settling
- [ ] Firefly's resume answer opens the same viewer
- [ ] Escape, `✕`, and a click on the dimmed area each close it
- [ ] Focus returns to whatever opened it, in both cases
- [ ] Clicking the sheet zooms to a readable width and back
- [ ] Chrome fades after ~2.5s and returns on movement, and Tab always reaches it
- [ ] Download PDF saves the real file
- [ ] The page behind is on the same section after closing as before opening

- [ ] **Step 4: Walk them on a phone profile**

In device emulation, pick a small phone (e.g. iPhone SE) with touch enabled.

- [ ] The sheet fills the width and the dialog scrolls to read down it
- [ ] The chrome never fades
- [ ] Pinch-zoom magnifies the page
- [ ] Scrolling the resume never snaps the page behind to another section
- [ ] Closing leaves the page exactly where it was

- [ ] **Step 5: Check reduced motion**

Turn on Reduce Motion (macOS: System Settings → Accessibility → Display → Reduce motion) and reload.
Expected: the sheet fades in with no drop, tilt, or scale, and everything else still works.

- [ ] **Step 6: Confirm the page-count path**

Run: `npm run resume && npm run check`
Expected: regenerating from the unchanged PDF produces the same single page and the check stays green. This is the command Johnny runs after replacing the PDF; a two-page resume would appear as `page-1.png` and `page-2.png` with no code change.

- [ ] **Step 7: Commit anything the pass turned up**

If steps 1-6 required fixes:

```bash
git add -A
git commit -m "fix: address issues found in the resume viewer verification pass"
```

---

## Notes for the implementer

- **Do not add a test runner.** The repo has none by design. `scripts/check-*.ts` assertion scripts are the idiom; follow it.
- **Do not hardcode copy into components.** Everything visible comes from `RESUME` in `PORTFOLIO.ts`.
- **`src/app/_resume/pages.ts` is generated.** Never hand-edit it; re-run `npm run resume`.
- **The sheet's spring values are load-bearing for the design**, not arbitrary: they match `FireflyChat.tsx` so the two overlays read as the same hand. Do not tune them without saying so.
- Out of scope, per the spec: deep-linking (`#resume`), text selection or in-page search, print styles, and any pan or zoom UI beyond the single click-to-zoom toggle.
