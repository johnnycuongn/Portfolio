# /ask — AI-first slide-answer route

**Date:** 2026-08-08
**Status:** Approved design, pending implementation plan

## Purpose

A new route, `/ask`, that presents the portfolio the way AI apps present themselves:
a prompt input as the hero. Answers are not chat bubbles — each one renders as a
full-viewport *slide* above a bottom-pinned input. One slide at a time, nothing to
scroll, minimal text at presentation scale. Asking about experience or projects makes
the answer *become* that page: a slide-native timeline or project deck.

The main page and its three-act scroll are untouched except for one new nav entry.

## Decisions made (brainstorm outcomes)

| Question | Decision |
|---|---|
| Landing layout | Mini-hero + prompt: compressed hero above a centered input |
| Default answer format | Editorial: left-aligned, teal kicker, headline, dash-fragments |
| Extra slide formats | List slide (teal pills). Two formats total + takeovers |
| Experience/projects render | Slide-native (one entry at a time, dot-axis stepping) — not embedded main-page components |
| Past answers | Latest slide only + a 1–2 line recap trail on top; no deck navigation |
| Context management | Past turns sent to the model as recaps, not full answers |
| Persona | The firefly answers on /ask, same voice as the main-page chat |
| Actions | [[RESUME]] and [[CONTACT]] sentinels work on /ask |
| Transcript logging | Anonymous session id → private Vercel Blob; disclosed in /ask's privacy line; /ask only |
| Protocol | Extend the existing sentinel protocol (no JSON, no client-side guessing) |

## Page anatomy

### Route

- `src/app/ask/page.tsx`, a client component with its own metadata (title "Ask about Johnny").
- Main nav gains an "Ask" entry linking to `/ask`.
- `/ask` carries a quiet "or scroll the classic site" link back to `/`.

### Landing state

Compressed hero, all content from `PORTFOLIO.ts`: name large, role, one intro line.
Below it: a near-full-width rounded input (visually the chat input grown up), the
existing `CHAT.chips` suggestions, and the firefly's glowing dot docked beside the
input. The firefly pulses gently at idle.

### The morph (first send)

- Name shrinks into a small top-left corner mark.
- Role and intro fade out.
- Input glides to the bottom edge and stays pinned there.
- Motion via `motion/react` layout animations — small amplitude, short duration,
  per the site's design language.

### Answer state

- Bottom: pinned input, near full width. `useKeyboardInset` keeps it above the
  mobile keyboard.
- Above: exactly one slide. A new answer replaces it with a quick wipe.
- Slide skeleton (Editorial): teal uppercase kicker = the visitor's question;
  bold slide-scale headline; muted dash-fragments below.
- The left-to-right "text entering" effect is the token stream itself, dressed
  with a soft leading-edge mask. No buffering of body text.
- The slide area is `overflow-hidden` with a bottom fade mask — the page never
  scrolls even if the model overruns its length caps.
- `useReducedMotion`: no wipes or pops; text appears instantly.

### History trail

- A quiet label (e.g. "so far") at the top of the slide area with each past
  exchange as a 1–2 line gray subtext entry, newest last, only the last ~4
  visible, older entries fading out. Review only — not navigation.
- Trail entries come from the model's `[[RECAP …]]` sentinel (below). If the
  recap is missing, the entry falls back to the visitor's question text.
- /ask has its own localStorage key (chat + recaps + session id), separate from
  the main-page firefly chat. Same character, fresh room. Clear resets all of it.

## Response protocol

Applies only when the client sends `surface: 'ask'` to `/api/chat`; the main-page
chat's prompt and behavior are unchanged. The system prompt gains slide-formatting
rules only for /ask.

### Reply shape (what the model is instructed to produce)

1. Optional first line — a format tag:
   `[[SLIDE LIST]]` | `[[SLIDE EXPERIENCE]]` | `[[SLIDE PROJECTS]]`.
   Absent = Editorial.
2. Body, plain text:
   - First line: the headline (prompt-capped at ~8 words).
   - Then up to 3 `- ` fragment lines (Editorial) or up to 8 item lines (List).
3. Optional trailing sentinels, on their own lines:
   - `[[RECAP <1–2 line summary of this exchange>]]` — expected on every reply.
   - `[[RESUME]]`, `[[CONTACT|name|email|message]]` — as today.

### Streaming behavior

- The route strips the leading format tag before streaming body tokens and emits
  it to the client as an early NDJSON event `{type:'format', format:…}` so the
  right slide component mounts before the first word arrives.
- Trailing sentinels reuse the existing held-tail logic in `sentinel.ts`
  (`heldPrefixLength`), extended with the new command markers.
- `splitSentinel` grows: `RECAP` (returns the summary text) and the leading-tag
  parser. Multiple trailing sentinels on one reply (recap + action) must parse.

### Safe failure (the contract)

Every malformed case — unknown tag, missing headline, unparseable recap, JSON-free
garbage — degrades to an Editorial slide rendering the full visible text, with no
action and question-text as the trail entry. Nothing the model does can break the
page; this mirrors the existing sentinel module's philosophy.

### Context sent to the model

- Prior turns are compressed: each becomes `Q: <question>` / `A: <recap>`.
- Only the immediately previous answer is sent in full, so follow-ups
  ("tell me more about that") keep working.
- The **client** builds this compressed history (it already holds the recaps in
  state) and sends it in the existing `messages` shape, so the route and
  provider stay history-agnostic.
- `MAX_HISTORY` now bounds recap-sized turns, so the token cost per request drops
  substantially even as conversations lengthen.

## Slide components

New components under `src/app/ask/` (co-located, since only /ask uses them):

1. **EditorialSlide** — kicker, streaming headline, dash-fragments.
2. **ListSlide** — streaming headline; teal pills (`bg-teal-400/10 text-teal-300`,
   the site's existing pill language) pop in staggered as item lines complete.
3. **ExperienceSlide** (takeover) — the model's one-line intro streams as the
   headline; on `done`, the slide-native timeline mounts: one role at a time in
   slide type (role · company as headline, one story line, stack pills) above a
   thin dot-axis; ‹ › buttons and arrow keys step through roles; the active dot
   glows teal. Data read directly from `PORTFOLIO.ts` job timeline data, matching
   how existing components consume it.
4. **ProjectsSlide** (takeover) — same pattern: one project in focus (image,
   title, one-liner, stack pills), dot-axis stepping; clicking the title opens
   the project link.

## Actions and persona

- On `done`: `[[RESUME]]` auto-opens the ResumeViewer (`ResumeViewerProvider`
  gets mounted in /ask's tree); `[[CONTACT|…]]` renders the existing
  `ContactSendButton` on the slide beneath the fragments.
- The firefly dot idles beside the input and pulses faster while a reply streams
  (the existing `FireflyDot` fast mode) — its "thinking" tell.

## Transcript logging

- New dependency: `@vercel/blob`. Requires `BLOB_READ_WRITE_TOKEN` in Vercel.
  When the token is absent (local dev), logging silently disables.
- The client generates `crypto.randomUUID()` per conversation, persists it with
  the /ask chat in localStorage, sends it with each request, resets it on Clear.
  No IP addresses are read, hashed, or stored anywhere.
- After each turn settles, the route fire-and-forgets:
  `put('asks/<session-id>.txt', fullTranscript, { access: 'private', allowOverwrite: true })`
  — one private blob per conversation, rewritten each turn, timestamps inside.
  A failed write logs to console and never delays or breaks the visitor's reply.
- Scope: /ask only. The main-page chat's "stays in your browser" promise is
  untouched. /ask displays its own honest privacy line
  ("anonymous conversations may be saved").

## Content and configuration

A new `ASK` block in `PORTFOLIO.ts`: intro line, input placeholder, history-trail
label, back-to-site label, privacy line. Chips are reused from `CHAT.chips`. No
visitor-facing text is hardcoded in components.

## Failure handling summary

| Failure | Outcome |
|---|---|
| Provider down / quota | Existing failover chain; offline message renders as an Editorial slide |
| Malformed format tag or sentinel | Editorial slide with full text; no action |
| Missing recap | Trail entry falls back to the question text |
| Over-long answer | `overflow-hidden` + bottom fade; page never scrolls |
| Blob write fails | Console log only; visitor unaffected |
| Reduced motion | All entrance animations replaced with instant appearance |

## Out of scope

- Deck-style navigation through past slides (explicitly rejected: latest only).
- Any change to the main page beyond the one nav entry.
- Logging the main-page chat.
- Replacing `/` with `/ask` as the landing page.

## Verification

No test suite exists in this repo. Verification is:
- `npm run build` and `npm run lint` pass.
- Manual dev-server walkthrough: landing → morph → each slide format; experience
  and projects takeovers including stepping; resume and contact actions; recap
  trail accumulation; clear/reset; mobile keyboard; reduced-motion mode; blob
  logging observed in a Vercel preview (or token set locally).
