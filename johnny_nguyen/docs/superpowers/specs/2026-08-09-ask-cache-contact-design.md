# /ask — answer cache, rail format, contact form

**Date:** 2026-08-09
**Status:** Approved design, pending implementation plan
**Builds on:** `docs/superpowers/specs/2026-08-08-ask-route-design.md` (the /ask feature, complete on branch `ask-route`)

## Purpose

Three additions to /ask:

1. **Answer cache** — common recruiter questions answered instantly from a
   Vercel Blob-backed cache, consulted before the AI; AI answers to new
   context-free questions are written back so the cache grows.
2. **Rail slide format** — a reusable horizontal snap-scrolling card rail:
   the projects takeover becomes a card rail (like the main page's
   ProjectRail), and the model gains a `[[SLIDE RAIL]]` format for answers
   that are lists of long items.
3. **Contact form** — on /ask the model stops collecting name/email
   conversationally; a two-input form (full name, email) renders on the
   slide, message prefilled when the visitor already said it, with a
   confirm step before sending.

## Decisions made (brainstorm outcomes)

| Question | Decision |
|---|---|
| Cache matching | Normalized text + tag keywords — no extra API calls; exact phrasing first, keyword scoring second |
| Shared-cache write-back | Context-free only: first-turn questions, parsed clean, no contact action, length-capped |
| Cache lookup timing | Any turn, but only high-confidence matches serve; follow-ups fall through to AI |
| Contact form scope | /ask only; the main-page chat's conversational flow is untouched |
| Projects takeover | Reworked to a horizontal snap-scrolling card rail |
| Rail reuse | Rail is a shared component + a model-selectable `[[SLIDE RAIL]]` format for image-less long-item lists |

## 1. Answer cache

### Storage

- One JSON index blob `ask-cache/v1.json` in the existing private Vercel
  Blob store (same `BLOB_READ_WRITE_TOKEN`). No token = cache silently
  off (both lookup and write-back), like transcript logging.
- Entry shape:

```ts
interface CacheEntry {
  id: string;                    // stable slug, e.g. 'who-is-johnny'
  phrasings: string[];           // normalized exact question strings
  keywords: string[];            // for scored matching
  format: SlideFormat;           // 'editorial' | 'list' | 'rail' | 'experience' | 'projects'
  answer: string;                // slide body text (headline + item lines)
  action: 'resume' | 'contact-form' | null;
  recap: string;                 // what goes in the trail / model context
  seeded: boolean;               // seeds are never evicted or overwritten
  hits: number;
  updatedAt: number;
}
```

- The route holds the parsed index in module memory with a ~60s TTL:
  warm lambdas answer hits with zero network calls; cold start pays one
  small blob read.

### Matching (pure, check-scripted — `src/app/_ai/cache.ts`)

- `normalizeQuestion(q)`: lowercase, strip punctuation, collapse
  whitespace, cap length.
- `matchCache(entries, question)`:
  1. exact normalized-phrasing match → hit;
  2. else keyword score per entry (matched keywords / entry keywords,
     with stopwords ignored) over a confidence threshold → best hit;
  3. else miss. Thresholds tuned so short follow-ups ("tell me more",
     "why") can never match.

### Serving a hit

- Same NDJSON protocol; the client is unchanged: `{type:'format'}`, one
  `{type:'token'}` carrying the whole answer, `{type:'done'}` with the
  mapped action and the entry's recap. Answer appears instantly with the
  normal entrance animation.
- A hit still logs to the transcript, and bumps `hits` fire-and-forget
  via `after()`.

### Miss → AI → write-back

- Miss streams from the provider exactly as today.
- Write-back happens only when ALL hold: the question was the
  conversation's first turn (no prior turns in the request); the reply
  parsed cleanly (has a headline; known format); the reply carried no
  contact action; question and answer within length caps; question
  normalizes to something reasonable (no emails/URLs).
- The new entry gets: the normalized question as its phrasing, derived
  keywords (question's content words minus stopwords), the reply's
  format/answer/recap, `seeded: false`.
- Write-back is read-modify-write on the index via `after()`;
  concurrent writers are last-writer-wins; the index caps at 200
  entries, evicting oldest unseeded entries first.

## 2. Seeding migration

- `scripts/seed-ask-cache.ts`, run as `npm run seed:ask` with
  `BLOB_READ_WRITE_TOKEN` set. Reads the index if it exists and adds
  only entries whose `id` is missing — re-running is safe, and edited or
  grown entries are never overwritten.
- Seed copy lives in `src/app/_ai/seeds.ts`, in the firefly's voice,
  within the slide length caps, built from `PORTFOLIO.ts` fields
  wherever possible so answers cannot drift from the site. Education and
  location facts (not in PORTFOLIO.ts) are hardcoded in seeds.ts —
  **Johnny reviews all seed copy at spec/implementation review**.

### Seed entries (~20)

| id | Sample phrasings (normalized) | Keywords | Format | Action | Answer sketch |
|---|---|---|---|---|---|
| who-is-johnny | "who is johnny", "tell me about johnny", "introduce johnny", "who is he", "tell me about him" | who, about, introduce, background | editorial | — | Headline: role + what he does; fragments: 3 years end-to-end, sectors, Sydney |
| resume | "can i see his resume", "open resume", "show me his cv", "resume", "cv", "download resume" | resume, cv, download | editorial | resume | "Full resume is one click away." (auto-opens viewer) |
| experience | "whats his experience", "walk me through his work history", "work history", "his experience", "past roles" | experience, history, roles, career, worked | experience | — | Headline only; timeline renders beneath |
| current-role | "where does he work now", "what is he doing currently", "current job" | current, now, today, imsx | editorial | — | iMSX, enterprise systems, owns features end-to-end |
| skills | "what tech does he use", "whats his stack", "his skills", "is he full stack", "technologies" | tech, stack, skills, tools, languages | list | — | Headline + pills from PORTFOLIO.techs |
| databases | "does he know databases", "sql experience" | database, sql, postgres, mysql | editorial | — | PostgreSQL/MySQL/MSSQL in day job, behind .NET/Node |
| cloud | "does he know aws", "cloud experience" | aws, cloud, infrastructure, devops | list | — | Headline + pills from TECH_SERVICES.AWS |
| projects | "what has he built", "show me his projects", "side projects", "his projects" | projects, built, portfolio, apps | projects | — | Headline only; project rail renders beneath |
| education | "where did he study", "does he have a degree", "education" | education, degree, university, study, uts | editorial | — | Bachelor of CS (Honours), UTS, First Class Honours |
| location | "where is he based", "is he in sydney", "location" | location, based, sydney, city, live | editorial | — | Sydney, NSW |
| availability | "is he open to work", "is he available", "when can he start", "notice period" | available, start, open, notice, hiring | editorial | contact-form | Honest "best asked directly" + form |
| salary | "salary expectations", "what are his rates", "how much does he cost" | salary, rate, compensation, pay, cost | editorial | contact-form | "One for Johnny himself" + form |
| work-rights | "does he have work rights", "visa status", "can he work in australia" | visa, rights, citizen, sponsorship | editorial | contact-form | "Best asked directly" + form |
| remote | "does he work remote", "is he open to remote", "hybrid" | remote, hybrid, onsite, office | editorial | contact-form | "Depends on the role — ask him" + form |
| contact | "how do i reach him", "i want to talk to him", "contact johnny", "get in touch", "hire him" | contact, reach, email, talk, hire, message | editorial | contact-form | Short line + form |
| strengths | "what are his strengths", "what is he good at" | strengths, good, best | editorial | — | Owns features end-to-end; humble register |
| why-hire | "why should we hire him", "what makes him different" | hire, why, different, standout | editorial | — | "Not my call" register + end-to-end evidence, resume pointer |
| github | "does he have github", "where is his code" | github, code, repos | editorial | — | GitHub profile line (link stays in page footer/profiles) |
| fun-fact | "tell me a fun fact", "something fun about him" | fun, fact, hobby, interesting | editorial | — | From PORTFOLIO_AI_knowledge prose (firefly's overheard register) |
| ai-tools | "does he use ai", "ai experience", "does he use claude" | ai, claude, copilot, llm | editorial | — | AI-driven workflow line (Claude Code etc., per resume) |

Exact phrasings/keywords/copy are finalized in `seeds.ts` during
implementation; the table is the binding scope.

## 3. Rail slide format

### Shared component

`SlideRail` — a horizontal snap-scrolling rail of cards inside the
slide. Cards are compact: optional image on top, title, body text
(clamped), optional teal pills. Roughly 2.5 cards visible; the next
peeks in from the right edge as the scroll cue. Scrolls sideways by
trackpad/drag/touch; ‹ › buttons and arrow keys nudge card-by-card
(snap-aligned; keyboard guard for inputs stays). Vertical page scroll
remains locked. `useReducedMotion` honored.

### Consumers

1. **ProjectsSlide (rework)** — feeds `SlideRail` the PORTFOLIO projects
   (image, title, clamped description, stack pills; title links out).
   Replaces the current one-card dot-stepping deck. ExperienceSlide
   keeps its deck — its content is too text-heavy for cards.
2. **RailSlide (new format)** — the model emits `[[SLIDE RAIL]]` when the
   answer is a set of 3–6 items each needing a sentence or two. Body
   protocol: headline line, then card lines shaped `- Title | detail
   sentence(s)`. Parsing (`parseRailCards` in `slides.ts`, pure,
   check-scripted): split each item line on the first `|`; a line
   without `|` becomes a body-only card. If no line parses card-shaped,
   the whole reply degrades to an Editorial slide with the full text —
   safe failure as everywhere.

### Protocol changes

- `SlideFormat` gains `'rail'`; `scanLeadingTag` gains `[[SLIDE RAIL]]`.
- `SLIDE_RULES` gains the RAIL instruction, and its LIST rule is
  sharpened: LIST for short 1–3 word items, RAIL for meaty items.

## 4. Contact form

### Protocol (ask surface only; chat surface byte-identical)

- Ask-surface `SLIDE_RULES` replaces the conversational contact
  instructions: on contact intent, answer briefly and end with
  `[[CONTACT]]` (nothing gathered yet) or `[[CONTACT <drafted message>]]`
  (the visitor already said what they want). Never ask for name or email.
- `sentinel.ts`: `parseCommand` for a `CONTACT` body first tries today's
  3-field `name|email|message` parse (chat behavior preserved
  verbatim); if that shape isn't present, it yields
  `{ kind: 'contact-form', draft: string }` (possibly empty draft,
  length-capped). The route maps `contact-form` to an action only on
  the ask surface; on the chat surface it maps to no action — exactly
  today's malformed-contact behavior.
- `ChatAction` gains `form?: { draft: string }`. Cache entries with
  `action: 'contact-form'` produce the same action — the form can open
  with zero AI calls.

### The form (slide-styled card, not a browser modal)

- Renders beneath the answer text on the slide: **Full name** input,
  **Email** input, and the **message**: prefilled and editable when a
  draft arrived; otherwise empty behind a prompt ("What should he
  know?").
- Send stays disabled until name is non-empty, email passes the existing
  `validateDraft` email rule, and message is non-empty — validated in
  the UI before anything is posted.
- **Confirm step:** Send flips the card to a read-back — "Send this to
  Johnny?" + the final message — with Confirm / Edit. Confirm POSTs the
  existing `/api/contact` (route unchanged); success shows the terminal
  sent state; any failure degrades to the mailto link, mirroring
  `ContactSendButton`.
- All labels/prompts live in the `ASK` block of `PORTFOLIO.ts`.
- The main page's `ContactSendButton` flow is untouched.

## Failure handling

| Failure | Outcome |
|---|---|
| Blob unreachable / no token | Cache lookup and write-back silently skip; AI path as today |
| Corrupt cache index JSON | Treated as empty; next write-back/seed rebuilds |
| Low-confidence match | Miss — AI answers |
| Malformed RAIL card lines | Editorial slide with full text |
| Contact form invalid input | Send disabled; inline validation only |
| /api/contact failure | Mailto fallback, as today |
| Write-back race | Last-writer-wins; capped at 200 entries |

## Out of scope

- Embeddings or model-assisted matching (revisit if keyword matching
  under-serves).
- Any change to the main page or its chat flow.
- Admin UI for reviewing/editing cached entries (blob is inspectable in
  the Vercel dashboard; follow-up if needed).
- Caching follow-up (context-dependent) answers.

## Verification

- Check scripts (repo pattern): `check-cache.ts` (normalize + match:
  exact, scored, threshold, follow-up immunity), extended
  `check-slides.ts` (RAIL tag + `parseRailCards`), extended
  `check-sentinel.ts` (contact-form command both shapes), seed script
  dry-run mode asserted (`--dry` prints adds without writing).
- `npm run build`, `npm run lint` clean.
- Browser walkthrough: seeded hits ("who is johnny" instant, "resume"
  auto-open, "experience" timeline, "projects" rail scroll/snap), a
  novel question (AI path + write-back visible in blob), rail format via
  a prompt likely to trigger it, contact flow end-to-end (draft and
  no-draft paths, confirm, sent state), main-page chat regression.
- `npm run seed:ask` against the real store once `BLOB_READ_WRITE_TOKEN`
  is set.
