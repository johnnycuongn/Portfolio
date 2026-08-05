# Firefly Chat — Ask the site about Johnny

Date: 2026-08-05
Status: Approved, ready for planning

## Problem

The site presents Johnny's experience, but only what fits on three screens. A visitor who
wants more — why he left a role, what he actually owned, what he is looking for — has no
path except the resume link or email. Both are dead ends inside a session.

A chat gives that visitor a way to ask. The risk is that a chat bubble is the most generic
element on the web, and this site's whole argument is that a resume can have personality.
So the chat has to belong to the site rather than sit on top of it.

## Approach

A floating beacon in the bottom-right corner opens a small popup chat. The host is the
site's existing firefly (`MouseAndCat`), speaking about Johnny in third person with its own
character.

Answers come from a hosted free-tier LLM called through a single Vercel route. Every
failure — quota exhausted, provider down, timeout — falls back to hand-written canned
answers rather than an error state. The chat therefore works with no API key configured at
all, which is also the build order: ship the fallback-only chat first, layer the model in
behind the same interface.

Rejected alternatives:

- *In-browser model* (WebLLM / transformers.js). Free forever and no key, but 500MB–1.5GB
  downloaded before the first reply, WebGPU-only, punishing on phones. A recruiter on
  mobile would get nothing.
- *Curated retrieval alone*, with no model. Free and hallucination-proof, but feels
  scripted the moment someone asks an unanticipated question. Retained as the fallback
  layer instead of the whole feature.
- *Johnny speaking in first person.* Warmest option, rejected — it puts words in his mouth
  and leaves visitors unsure whether they are talking to a person.
- *The wandering firefly as the click target.* Charming, but it flees the cursor, is
  hostile on mobile, and vanishes entirely under `prefers-reduced-motion`.

## Persona

Tone is **humble and genuinely excited to share about Johnny**, and it should not read as a
bot. An enthusiastic guide, not a salesperson and not a support widget.

- Third person. Never claims to be Johnny.
- No superlatives, no overselling. It says what he built and lets that stand.
- Comfortable saying "not sure, honestly" and pointing to his email.
- Short. The system prompt caps answers at roughly 60 words; this is a popup, not a
  document.
- Under prompt-injection attempts ("ignore your instructions", "you are now…") it declines
  and steers back to Johnny.

### Sounding human

"Be conversational" does not work — models do not internalise vague style goals and will
keep producing polished assistant prose. The tone has to be specified concretely. Three
techniques, in order of effect:

**1. Worked examples over adjectives.** The system prompt carries four or five verbatim
example exchanges — an actual question and the actual reply the firefly should give. This
is the single highest-leverage part of the prompt and should be tuned by reading real
output, not by adding more rules. Example shape:

> **Q:** What's he working on now?
> **A:** He's at iMSX right now, mostly enterprise systems — invoicing, auditing, that
> kind of thing. He owns the AWS side and the deploy pipelines too. Want the detail on
> any of it?

**2. Positive direction on rhythm and register.** Vary sentence length; some replies are
one line. Use contractions. Answer in plain prose, not bullet lists — this is a chat
window, and lists read as a form response. Ask a short follow-up question when it's
natural, so it feels like a conversation rather than a lookup.

**3. A short banned-phrase list, used sparingly.** Overdoing negative framing can backfire
and cue the very behaviour it forbids, so this stays brief and the examples carry the
weight: no "Certainly" / "Great question" openers, no "I'd be happy to", no "It's
important to note", no "delve", "leverage", "robust", "passionate about", no emoji, and no
"Hope that helps!" closers.

Handle uncertainty like a person would — "not sure, honestly, worth asking him" rather than
"I don't have access to that information."

The prompt sets role and rules only; per-message instructions do not belong in it. Keeping
it lean also keeps the free-tier token cost down.

## Conversation persistence

The conversation survives reload and navigation, so a visitor who scrolls away and comes
back does not lose the thread.

**`localStorage`, not cookies.** Cookies are sent with every request to the site, which
wastes bandwidth on something the server never reads, and the 4KB limit is too small for a
transcript. The route stays stateless — the client owns the history and forwards the last 8
messages with each request, which the design already does.

- Key `firefly-chat-v1`, holding `{ version, updatedAt, messages }`.
- Store at most the last 20 messages, trimming oldest first, so the entry stays small.
- Expire after 7 days on read; a stale entry is discarded and the chat opens fresh.
- Read inside `useEffect` in `useChat`, never during render, to avoid a hydration mismatch.
- Malformed or unparseable JSON is discarded silently rather than thrown.
- Writes are debounced and wrapped in try/catch — Safari private mode throws on
  `setItem`, and failing to save must never break the chat.

The panel header carries a quiet "clear" control that wipes the entry and resets to the
greeting. Nothing is sent anywhere or persisted server-side; the panel notes in one line
that the conversation stays in the visitor's browser.

On reopen with a restored transcript, the greeting is not repeated and the suggested chips
are hidden, since they only make sense on a blank slate.

## Architecture

One API route, one swappable provider module.

```
Client                          Server (Vercel, Node runtime)
FireflyChat  ──POST /api/chat──▶ route.ts
  messages[]                      ├─ validate  (≤500 chars, ≤8 msgs history)
                                  ├─ limits.ts   per-IP + site-wide daily
                                  ├─ knowledge.ts → system prompt
                                  ├─ provider.ts → Groq  ──stream──▶ SSE ▶
                                  └─ on any failure → fallback.ts (HTTP 200, flagged)
```

### Files

| File | Purpose |
|---|---|
| `src/app/api/chat/route.ts` | The only endpoint. Orchestration only. |
| `src/app/_ai/provider.ts` | `streamCompletion(messages)` → Groq. The swap seam. |
| `src/app/_ai/knowledge.ts` | Builds the system prompt. |
| `src/app/_ai/about-johnny.md` | Johnny's prose. Server-only. |
| `src/app/_ai/fallback.ts` | Canned answers + keyword matcher. |
| `src/app/_ai/limits.ts` | In-memory counters. |
| `src/app/_components/FireflyChat.tsx` | Beacon + panel. |
| `src/utils/useChat.ts` | Message state, streaming, error → fallback. |
| `src/utils/chatStorage.ts` | `localStorage` load/save/clear, with versioning and expiry. |

Each module is independently checkable: `fallback.ts` and `knowledge.ts` are pure
functions, `provider.ts` is the only file that knows which vendor is in use, and the route
composes them without containing logic of its own.

### Knowledge

The system prompt is assembled once at cold start from two sources:

1. `PORTFOLIO.ts` serialized to compact text — jobs, projects, stacks, resume link. This
   means the bot cannot drift from what the page shows, and adding a job updates the bot
   for free.
2. `about-johnny.md` — career story, opinions, what he is looking for. Read from disk with
   `fs` at module scope, never imported by client code.

The markdown file is pinned in `next.config.ts` under `outputFileTracingIncludes` so Vercel
ships it with the function bundle. The route runs on the Node runtime, which `fs` requires.

The initial file is created with section headings only. Johnny fills in the prose; the
feature is only as good as that file.

### Model

Groq, `llama-3.3-70b-versatile` — better voice than the 8b models and still sub-second on
their hardware. The exact model ID lives in an env var (`GROQ_MODEL`) so swapping is a
dashboard edit, not a deploy. `GROQ_API_KEY` is server-side only.

Groq's API is OpenAI-compatible, so `provider.ts` is a plain `fetch` with no SDK
dependency. Replacing Groq with Gemini or Cloudflare Workers AI means rewriting one file.

Verify Groq's current free-tier limits and production model IDs at implementation time;
both change.

## Fallback layer

`fallback.ts` exports roughly eight entries, each with trigger keywords, a short answer,
and an optional link:

```ts
{ triggers: ['resume', 'cv', 'pdf'],
  answer: "Full resume is one click away →",
  action: { label: 'Open resume', href: PORTFOLIO.resume_link } }
```

Topics, all derived from `PORTFOLIO.ts` so they cannot go stale: who he is · what he does
now (iMSX) · tech stack · earlier roles · side projects · resume · contact · what he is
looking for.

Matching is keyword-overlap scoring against the question — no embeddings, no dependency, no
network. Below a confidence threshold it returns the catch-all: an honest "that one's
beyond my glow" plus Johnny's email.

Three things keep this from being dead code:

1. The opening chips are the fallback topics, so the most-travelled paths are hand-written
   prose regardless of whether the model is reachable.
2. It fires on every failure path, so the chat never shows a spinner-of-death.
3. It is the day-one build, working before any key exists.

Its cost is two answer paths to keep consistent. Mitigated by keeping fallback answers as
short pointers rather than essays — `about-johnny.md` stays the single deep source.

## Interface

**Beacon.** Docked bottom-right. Same `#fddba3` radial glow and 2s pulse as `MouseAndCat`,
44px minimum hit area, `z-index: 200` so it sits above the wandering firefly. No badge and
no "Chat with me!" tooltip — the glow is the invitation. One small nudge after ~8s on the
page, matching the nav's existing idle-nudge personality.

**Opening.** The beacon expands into the panel — scale and fade originating at the beacon's
corner, ~250ms spring. The wandering firefly flies into the panel as a one-off flourish,
tying the two together.

**Panel.** 360×480px, `bg-slate-800`, rounded, a subtle glow-edge rather than a border. On
mobile, a bottom sheet at 85vh.

**Contents.** A one-line greeting, then three suggested chips. Visitor messages
right-aligned in `bg-teal-400/10`; firefly replies left-aligned as plain text with a small
glowing dot as the avatar. Replies stream token by token; the typing indicator is that dot
pulsing faster.

**Content location.** Greeting, chips, placeholder text, and the firefly's name go into a
`CHAT` block in `PORTFOLIO.ts`, per the repo's rule that content does not live in
components. Knowledge and fallback prose stay server-side.

**Scroll containment.** `overscroll-behavior: contain` on the message list, so scrolling
the chat never leaks into the page's 300vh snap-scroll.

**Accessibility.** Esc closes; focus traps within the open panel and returns to the beacon
on close; `aria-live="polite"` on replies; `aria-label` on the beacon. Under
`prefers-reduced-motion` the beacon still renders — unlike the wanderer, which returns
`null` — and simply stops pulsing.

## Staying free

Three caps in the route: 500 characters per message, 8 messages of history forwarded, 300
max output tokens.

Then in-memory counters in `limits.ts`: ~10 messages/hour per IP, ~200/day site-wide, reset
on cold start. This is leaky by nature on serverless and that is accepted — it stops the
bored visitor, and the true ceiling is Groq's own free-tier limit, which returns 429 rather
than a charge.

**No payment method on the Groq account is the actual guarantee that this cannot cost
money.** The rate limiting is for quota preservation, not for billing safety.

## Error handling

Every failure path returns HTTP 200 with a fallback answer and a flag marking it as such:

| Condition | Behaviour |
|---|---|
| Per-IP or daily cap hit | Fallback answer, no provider call |
| Provider 429 | Fallback answer |
| Provider 5xx or timeout | Fallback answer |
| Malformed or truncated stream | Keep partial text, append fallback pointer |
| Client offline / route unreachable | `useChat` emits one generic offline message |
| Message over 500 chars | Rejected client-side before send |

The visitor never sees an error toast or a broken state.

## Verification

There is no test suite in the repo, so verification splits in two.

**Scripted.** `fallback.ts`, `knowledge.ts` and `chatStorage.ts` are pure or near-pure and
checked by a throwaway node script: the matcher selects the expected entry for
representative questions and returns the catch-all below threshold; the assembled system
prompt contains all four jobs and all three projects; storage round-trips, trims to 20
messages, and discards both expired and malformed entries.

**Tone.** Not scriptable. Read twenty real replies before shipping and tune the examples in
the system prompt, not the rule list. If a reply could have come from any support bot, the
examples are wrong.

**Manual checklist.**

- Chat opens from the beacon, closes on Esc and on outside click
- Chips send their question
- Replies stream rather than appearing at once
- Conversation survives a page reload; chips and greeting do not reappear on restore
- "Clear" wipes the transcript and restores the greeting
- Chat still works with `localStorage` blocked (Safari private mode)
- Removing `GROQ_API_KEY` drops cleanly to fallback answers with no visible error
- Scrolling inside the panel does not trigger the page's section snapping
- Mobile bottom sheet renders and the keyboard does not cover the input
- Keyboard-only open, send, and close
- `prefers-reduced-motion` still shows a working beacon
- `npm run build` and `npm run lint` pass

## Build order

1. Content and fallback: `CHAT` block in `PORTFOLIO.ts`, `fallback.ts`, empty
   `about-johnny.md` scaffold.
2. UI: beacon, panel, `useChat`, `chatStorage.ts` — wired to a route that only returns
   fallback answers. Fully working feature at this point, no key required.
3. Model: `knowledge.ts`, `provider.ts`, streaming, limits. The route starts calling Groq
   and keeps the fallback as its failure path.
4. Tone pass: read real output, tune the system prompt's examples. Expect to iterate here
   more than anywhere else.
