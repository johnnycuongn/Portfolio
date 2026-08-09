# Johnny Nguyen — Portfolio

A personal portfolio site built as **a resume you scroll through** rather than a PDF you download. It shows who I am — role, experience, projects — with a bit of personality: a dark, minimal layout with one teal accent, and small playful motion (drag-to-reorder nav items, links that "fly away" when clicked, a firefly that wanders the page and flees your cursor).

Built with Next.js 15 (App Router), React 19, TypeScript, TailwindCSS, and [`motion`](https://motion.dev). Deployed on Vercel.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
```

Other commands:

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint
```

```bash
npm run check   # assertion scripts over the pure logic (stands in for a test suite)
npm run resume  # regenerate the resume page images from public/resume.pdf
```

There is no test framework. `npm run check` runs the `scripts/check-*.ts` files instead — plain
`node:assert` scripts covering the parts worth protecting (content shape, prompt assembly, the
reply protocol, storage, rate limits). New pure logic should get assertions there.

## Architecture

Two surfaces — the scrolling page and `/ask` — share one content file, one API route, and one
set of canned answers.

```mermaid
flowchart TB
  C["PORTFOLIO.ts<br/>all site content"]
  P["/ — scrolling resume<br/>page.tsx + _components"]
  A["/ask — slide Q&amp;A<br/>ask/page.tsx + slide renderers"]
  R["/api/chat<br/>one route, both surfaces"]
  L{"provider key set,<br/>under rate limit?"}
  K["_ai/knowledge.ts<br/>system prompt: PORTFOLIO.ts +<br/>PORTFOLIO_AI_knowledge.md"]
  G1["Gemini — primary"]
  G2["Groq — understudy"]
  S["_ai/slides.ts + sentinel.ts<br/>slide tag, action sentinels, recap"]
  F["_ai/fallback.ts<br/>hand-written answers"]
  O["NDJSON stream to useChat / useAsk<br/>renders as bubble or slide, saved to localStorage"]

  C --> P
  C --> A
  P -->|"visitor asks"| R
  A -->|"visitor asks"| R
  R --> L
  L -->|yes| K
  L -->|no| F
  K --> G1
  G1 -->|streams| S
  G1 -.->|"fails before a token"| G2
  G2 -->|streams| S
  G2 -.->|"fails too"| F
  S --> O
  F --> O
```

Not shown, to keep the diagram to one story: `/api/contact`, which takes the draft the firefly
assembled and sends it via Resend (falling back to a `mailto:` when unconfigured).

### Folder structure

```
src/
├── app/
│   ├── PORTFOLIO.ts               all site content — edit this, not the components
│   ├── PORTFOLIO_AI_knowledge.md  extra prose for the firefly (server-only, optional)
│   ├── page.tsx                   the scrolling resume: all three acts and the snap logic
│   ├── _components/               presentational pieces for that page + the chat/resume UI
│   ├── ask/                       the /ask surface: page + per-format slide renderers
│   ├── _ai/                       prompt, providers, reply protocol, fallbacks, rate limits
│   ├── _contact/                  draft validation + the Resend mailer
│   ├── _resume/                   manifest of the generated resume page images
│   └── api/
│       ├── chat/                  streams answers as NDJSON — serves both surfaces
│       └── contact/               sends a visitor's message to Johnny
└── utils/                         hooks: useAsk, useChat, storage, rail, motion helpers

scripts/                           build-resume.ts + the check-*.ts assertions
public/resume.pdf                  the downloadable resume; page images beside it
```

### How an answer gets made

1. **Ask.** `useChat` (firefly popup) or `useAsk` (`/ask`) POSTs the recent history to `/api/chat`,
   tagged with which surface it came from.
2. **Guard.** The route checks an in-memory rate limit and that a provider key exists. Either
   failing skips straight to step 6.
3. **Prompt.** `knowledge.ts` serialises `PORTFOLIO.ts` into facts, appends
   `PORTFOLIO_AI_knowledge.md` if it holds real prose, and — for `/ask` only — the slide rules.
4. **Stream.** Providers are tried in order, Gemini then Groq. One that fails *before* producing
   text is skipped silently; one that dies mid-sentence keeps its partial answer.
5. **Parse.** The reply is a small protocol, not free text: a leading `[[SLIDE …]]` tag picks the
   slide format, trailing `[[RESUME]]`/`[[CONTACT …]]`/`[[RECAP …]]` sentinels are stripped out and
   turned into buttons and history. Anything malformed degrades to a plain answer, never an error.
6. **Fall back.** With no key, no quota, or no working provider, `fallback.ts` serves a
   hand-written answer matched on keywords. The visitor gets a plainer reply — never a broken one.

Turns are persisted to `localStorage` on the client, so a refresh keeps the conversation. Nothing
about a visitor is stored server-side unless `BLOB_READ_WRITE_TOKEN` is set (see below).

## How the site is put together

The whole page is three full-viewport "acts" that scroll into each other:

1. **Hero** — name, role, profile icons, description, tech pills
2. **Experience** — a horizontal rail of job cards over a timeline axis
3. **Projects** — a horizontal rail of project cards, plus the footer

| Path | What it is |
| --- | --- |
| `src/app/PORTFOLIO.ts` | **All site content.** Edit this to update the resume. |
| `src/app/page.tsx` | The whole page — sections, scroll transforms, snap behaviour |
| `src/app/_components/` | Presentational pieces: nav bar, `Timeline`/`TimelineCard`, `ProjectRail`/`ProjectCard`, `ProfilesLinkGroup`, `MouseAndCat` |
| `src/utils/` | Small hooks (`useRail`, `useMousePosition`, `useDelayLinkOpen`, `wait`) |
| `next.config.ts` | Allowlist of remote image hosts |

Components read from `PORTFOLIO.ts` directly, so adding a job or project is a one-file change — you don't touch the components.

## Updating your resume (`src/app/PORTFOLIO.ts`)

Everything below lives in that one file. Newest entries go first; the site renders each list in the order you write it.

### 1. Your details

```ts
const PORTFOLIO = {
  name: "Duc (Johnny) Nguyen",
  role: "Software Engineer",
  description: "A product-focused software engineer",
  techs: ["Typescript", "AWS", "Node.js", ".NET Core", "PostgreSQL", "MySQL"],
  email: 'cuongdn2001@gmail.com',
  resume_link: 'https://drive.google.com/file/d/.../view?usp=sharing'
}
```

- `techs` render as the teal pills under the hero description. Keep the list short — the row is meant to read at a glance.
- `resume_link` opens in a new tab from the **Resume** nav item. Any public URL works (Google Drive, a PDF in `public/`, etc.); if you use Drive, make sure the sharing setting is "anyone with the link".
- `email` is what the **Contact** nav item reveals and copies to the clipboard.

### 2. Profile links

```ts
const PROFILE_LINKS = [
  { id: uuid(), link: "https://github.com/johnnycuongn", title: "GitHub" },
  { id: uuid(), link: "https://www.linkedin.com/in/...", title: "LinkedIn" },
]
```

`title` is not just a label — it picks the icon. `ProfilesLinkGroup.tsx` maps titles to icons and currently knows `GitHub`, `LinkedIn`, and `Goodreads`. To add a different profile, add an entry to the `iconMap` there with an icon from [`react-icons`](https://react-icons.github.io/react-icons/); a title with no matching icon renders nothing.

### 3. Jobs (the Experience timeline)

```ts
const JobTimelineData: JobTimeLineItem[] = [
  {
    year: 'Nov 2025 - Present',
    axisLabel: 'Now',
    title: 'Software Engineer',
    company: 'iMSX',
    content: "I have worked on more than 4 enterprise systems across various industry sectors...",
    link: 'https://imsx.com.au/',
    stacks: ['Typescript', 'AWS', 'Angular', '.NET Core', 'PostgreSQL', 'Docker'],
  },
  // ...older roles below
];
```

- `year` is free text and shows on the card — whatever reads well (`'Feb - Oct 2023'`, `'Nov 2025 - Present'`).
- `axisLabel` is optional and is the short label under the dot on the timeline axis (`'Now'`, `'2024–25'`, `'2023'`). Keep it to a few characters — labels sit side by side and long ones crowd each other. Omit it and the full `year` is used instead.
- `title` and `company` are shown together as `Title • Company`.
- `content` is a short paragraph of impact. Cards stretch to a shared height, so one much longer entry leaves whitespace in the others — keep them roughly even in length.
- `link` is where clicking the card goes (usually the company site). It's required; the card is fully clickable.
- `stacks` become the teal pills on the card.

The rail scrolls horizontally, and each job gets an equal share of the axis with a clickable dot, so just add entries in reverse-chronological order — nothing else to adjust.

### 4. Projects

```ts
const PROJECTS: Project[] = [
  {
    id: uuid(),
    title: 'Smart Inventory Management System',
    github: 'https://github.com/johnnycuongn/Inventory-Management-Sytem',
    image: 'https://raw.githubusercontent.com/johnnycuongn/Inventory-Management-Sytem/main/github_resources/poster.png',
    description: 'A Smart Inventory System leveraging RFID technology...',
    stacks: ["React", "Typescript", "Node.js", "MongoDB", "Vercel"]
  },
];
```

- Keep `id: uuid()` — the rail and cards look projects up by id.
- `image` is the card poster. The convention here is to commit a poster image to the project's own repo (e.g. `github_resources/poster.png`) and link the `raw.githubusercontent.com` URL. Leave it as `''` and the card falls back to a subtle gradient instead of breaking.
  - **Any new image host must be added to `remotePatterns` in `next.config.ts`**, or Next's image optimizer will reject it. Only `raw.githubusercontent.com/johnnycuongn/**` is allowed today. Images placed in `public/` can be referenced as `/my-poster.png` with no config change.
- `github` is where the card links. Empty falls back to my GitHub profile.
- `description` is clamped to three lines on the card — front-load the interesting part.

### Checklist for a new job or project

1. Add the entry to `JobTimelineData` or `PROJECTS` in `PORTFOLIO.ts` (newest first).
2. If it's a project with a poster on a new host, add that host to `next.config.ts`.
3. `npm run dev` and check both the timeline and the projects rail at desktop and mobile widths.
4. `npm run lint && npm run build` before pushing.

## Design notes

If you're changing more than content, the conventions worth keeping:

- Dark and minimal: `bg-slate-900` page, `bg-slate-800` cards, white primary text, `text-gray-300/400` secondary.
- **One** accent colour. Teal (`text-teal-300`, `bg-teal-400/10`) is used for tags and hover states. If you introduce a new accent, it should replace teal everywhere rather than sit alongside it.
- Motion is small-amplitude, short, and never blocks reading.
- Whitespace and large type are the aesthetic — resist filling empty space.
- Content belongs in `PORTFOLIO.ts`, never hardcoded into components.

## Deploying

Pushing to the connected branch deploys via Vercel. No environment variables are required — the site runs fine with none set, including the chat (see below) — but a provider key in the Vercel project settings enables live model answers.

## Chat (Firefly)

The floating firefly in the bottom-right corner answers questions about Johnny, and `/ask` is the
same firefly rendered as full-screen slides. Both read `src/app/PORTFOLIO.ts` plus
`src/app/PORTFOLIO_AI_knowledge.md` (server-only) and stream answers from Gemini, falling back to
Groq.

Environment variables — set in `.env.local` for development and in the Vercel
project settings for Production and Preview. `.env.example` documents each one in full.

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_AI_API_KEY` | No | From https://aistudio.google.com/apikey. The primary provider: the whole system prompt is re-sent on every message, and Gemini's free tier has the throughput for it. |
| `GEMINI_MODEL` | No | Defaults to `gemini-flash-latest`. **Leave it unset.** Pinned versions get retired and start returning 404 — `gemini-2.5-flash` and `gemini-2.5-flash-lite` both have. |
| `GROQ_API_KEY` | No | From https://console.groq.com. Leave the account without a payment method: the free tier is what keeps this feature from ever generating a bill. |
| `GROQ_MODEL` | No | Defaults to `llama-3.3-70b-versatile`. **Leave it unset.** `llama-3.1-8b-instant` looks like more headroom because its *daily* cap is higher, but the binding limit is tokens per *minute* — 6,000 against 70b's 12,000, on a ~5,800-token prompt. It roughly halves throughput. |
| `RESEND_API_KEY` | No | Enables the chat's send button to actually email Johnny. Unset falls back to a `mailto:`. |
| `BLOB_READ_WRITE_TOKEN` | No | `/ask` only. Enables private per-turn transcript logging to Vercel Blob. Unset is a silent no-op. |

If the chat is serving canned answers when you expect live ones, check the Vercel (or dev server)
logs for `provider stream failed` or `rate limited` — every failure path is logged there, and the
visitor-facing behaviour is identical whichever one fired.

With no key set, the chat still works — it serves the hand-written fallback
answers in `src/app/_ai/fallback.ts`. The same thing happens when the daily
free-tier quota runs out, so the chat degrades rather than breaking.
