# Chat actions: passing a message, and opening the resume

**Date:** 2026-08-06
**Status:** Approved, ready for implementation planning

Two things Firefly should be able to *do* rather than describe: send Johnny a message, and open the
resume. Both hang off the same mechanism — a sentinel line the model emits, which the chat route
strips from the stream and converts into an action on the `done` event.

## Problem

Every contact route on this site is a dead end that costs the visitor the page. The nav profile
links go to LinkedIn and GitHub; Firefly's `contact` and `looking` fallback answers
(`_ai/fallback.ts:60-71`) and its catch-all (`_ai/fallback.ts:74`) all hand out a `mailto:`.
A `mailto:` on a phone is a coin flip — it opens a mail client the visitor may not have configured,
or nothing at all — and on a laptop it drops them into a blank compose window with no idea what to
say.

Someone who has just spent two minutes asking Firefly about Johnny's AWS work is as warm as a
portfolio visitor gets. They should be able to say "tell him I'm interested" in the panel they are
already in, and have it arrive in his inbox.

The resume has the mirror-image problem. `useResumeViewer` already exposes `open()`, and
`FireflyChat.tsx:45` already calls it — but only for the `opens: 'resume'` action, which only the
canned fallback ever produces (`_ai/fallback.ts:58`). `modelResponse` hard-codes `action: null`
(`api/chat/route.ts:80`), so **whenever Groq is healthy, asking Firefly for the resume yields prose
and no button.** The prompt papers over this by describing the nav button instead
(`_ai/knowledge.ts:20`) — telling a visitor where to click is a worse answer than clicking for them.
Asking to see the resume should open the resume.

## Constraints

- **The chat must never break.** `api/chat/route.ts` is built so a provider failure, a rate limit,
  or a missing key still returns a friendly answer. Nothing added here may introduce a path where
  the visitor sees an error state or a dead button.
- **Free tier only.** `.env.example` states the rule for Groq — no payment method, the free tier is
  the spending guarantee. The same applies to email.
- **No SDKs.** `_ai/provider.ts` talks to Groq with a plain `fetch` and hand-rolled SSE parsing so
  that swapping providers means rewriting one file. Email follows that.
- Content belongs in `PORTFOLIO.ts` (CLAUDE.md). Components read it directly.
- Design language: dark, one teal accent, no borders or boxes, small-amplitude motion.
- `FireflyChat.tsx` is already 367 lines. New stateful UI goes in its own component.

## Decisions

| Decision | Choice |
|---|---|
| Collection | Conversational — Firefly asks for name and email in its own voice |
| Send trigger | An explicit **Send it →** button in the reply. The model never sends |
| Model → UI channel | A sentinel line the chat route strips from the stream and parses |
| Email provider | Resend, free tier, no domain — `onboarding@resend.dev` → `cuongdn2001@gmail.com` |
| Email body | Name, email, message. No transcript |
| Confirmation to visitor | In-panel only. No email to the visitor |
| Fallback path (contact) | Unchanged `mailto:` — the feature is absent when the model is |
| Resume on the model path | A `[[RESUME]]` sentinel, same grammar, yielding the existing `opens: 'resume'` action |
| Resume opening | Automatic once the reply settles, **and** the button stays for reopening |

Note the asymmetry between the two features on the fallback path, and that it is deliberate:
the resume works there already (`_ai/fallback.ts:55-59` matches on `resume`/`cv`/`pdf`), so
auto-open makes it *better* when the model is down. Contact cannot work there, because Firefly is
what collects the details.

Rejected: **an inline form** in the panel (deterministic and fallback-safe, but a three-field form
is the boxy UI this design language avoids, and the conversational collection is the reason the
chat exists); **Groq tool calling** (`delta.tool_calls` fragments must be reassembled across SSE
chunks, which is a rewrite of `streamCompletion` and the end of its one-fetch simplicity);
**model-initiated sending** (a visitor could talk Firefly into mailing thirty times, and a typo'd
address is unrecoverable); **mailing the transcript** (useful context, but it falsifies the panel's
"This chat stays in your browser" promise, which visitors read before typing);
**Web3Forms** (no signup, but a third party stores every submission and the ceiling is 250/month);
**Gmail SMTP** (needs 2FA plus an app password, adds `nodemailer`, and SMTP from a serverless
function is the flakiest of the three).

## Flow

1. A visitor asks about contacting Johnny, or Firefly's answer reaches the end of what it knows.
2. Firefly offers to carry a message, then collects — name, email, what they want — across however
   many turns it takes, in its normal voice. It never renders a form.
3. Once it has all three it reads them back in one sentence and ends its reply with a sentinel
   line. The route strips the sentinel and attaches it to the `done` event as an action.
4. The reply renders with a single **Send it →** button, styled like the existing resume and GitHub
   actions. **Nothing has been sent.**
5. Clicking POSTs the three fields to `/api/contact`. The button reads "Sending…", then settles to
   "Sent — he'll see it." On any failure it becomes **Email him directly →** (`mailto:`).

### Consequences accepted

- **When the model is down or rate-limited, this feature is not there.** `fallbackResponse` keeps
  returning the `mailto:` action exactly as today. Firefly is what collects the details, so there
  is nothing to collect with when it is offline. Bolting a form onto the fallback path would mean
  two collection UIs for one feature.
- **The visitor never gets a copy of their message.** Resend's free tier without a verified domain
  delivers only to the account's own address. Firefly saying "sent" is the entire confirmation.

## Resume: opening instead of describing

Two changes, both small because the plumbing exists.

**Reaching the viewer from the model path.** `[[RESUME]]` — the same sentinel grammar, no fields.
The route converts it to the action the fallback already returns:
`{ label: CHAT.resumeLabel, opens: 'resume' }`. `FireflyChat` renders it with the branch at
`FireflyChat.tsx:318` that already exists. Nothing new in the UI.

**Auto-opening.** An effect in `FireflyChat` watches for a *settled* reply whose action is
`opens: 'resume'` and calls `openResume()`. Rules:

- **Only after the stream settles** — keyed on the `done` event, not on tokens. Opening a
  full-screen dialog mid-sentence would cover the sentence.
- **Once per message**, guarded by the message id in a ref. Dismissing the viewer must not have it
  immediately reopen, and a re-render must not fight the visitor.
- **Never on a restored transcript.** `useChat` rehydrates from storage on mount; a resume answer
  from last week must not throw the viewer up on page load. Keying on the `true → false` streaming
  transition gives this for free — a restored message never streams.
- **The button still renders.** Auto-open is a convenience on top of the action, never a
  replacement — so a visitor who dismisses the viewer has a way back, and the answer still reads
  correctly in the transcript afterwards.

This also makes the existing **Resume** chip (`PORTFOLIO.ts:54`) open the viewer, since it sends
"Can I see Johnny's resume?" through the normal path.

The prompt line at `_ai/knowledge.ts:20` — "the Resume button in the top-right corner brings it up"
— is replaced with an instruction to emit `[[RESUME]]`, because that sentence is now wrong advice.

A false positive here costs more than a missing button: a model that emits `[[RESUME]]` on an
unrelated question covers the visitor's screen unbidden. The mitigation is the prompt being narrow
about when to emit it, plus the once-per-message guard bounding the damage to a single dismiss.

## The sentinel

Firefly ends a reply with a sentinel on its own final line, in one of two forms:

```
[[CONTACT name | email | message]]
[[RESUME]]
```

`api/chat/route.ts` already buffers the provider stream and already emits an `action` on its `done`
event, so this rides existing machinery.

**Parsing rules**, all of which fail toward "a normal reply, no action":

- From the first `[[` that begins a known command (`[[CONTACT` or `[[RESUME`) onward, no token is
  written to the client. The visible reply ends at the character before it, right-trimmed. A `[[`
  that is not one of these is ordinary text and streams through untouched.
- Because a sentinel arrives across several SSE chunks, the parser holds back any trailing text
  that is still a viable *prefix* of `[[CONTACT`/`[[RESUME` and releases it as soon as it cannot be.
- The held-back text is parsed only once the stream completes. A sentinel that never closes with
  `]]` is discarded.
- `CONTACT` fields split on `|`, in order, trimmed. Fewer than three fields, or any field failing
  the validation below, discards the whole sentinel.
- One action per reply: the first valid sentinel wins, later ones are ignored.
- The emitted action is `{ label, sends: {...} }` or `{ label, opens: 'resume' }`. **Labels come
  from `PORTFOLIO.ts`, never from the model.**

The model is never trusted to produce a valid sentinel — it is trusted only to produce *a*
sentinel, and the route decides whether a button appears. This is also the injection boundary: the
worst a visitor can do by talking Firefly into a strange sentinel is put text in front of
themselves, because the send still needs a human click and the rate limiter bounds how many clicks
matter.

## Architecture

### New files

Sentinel parsing lives under `_ai/` because it parses *model output*; `_contact/` holds only the
email side. That keeps the dependency pointing one way — `_ai/` may import `_contact/draft`, never
the reverse.

- **`src/app/_ai/sentinel.ts`** — pure, no I/O, and the piece worth getting right:
  `splitSentinel(text)` returns `{ visible, command: null | { kind: 'contact', draft } | { kind: 'resume' } }`,
  plus `heldPrefixLength(text)` for the streaming hold-back.
- **`src/app/_contact/draft.ts`** — `ContactDraft { name, email, message }`, the field caps, and
  `validateDraft`. Type and validation live together because they change together, and it imports
  nothing, which is what keeps the dependency direction clean.
- **`src/app/_contact/mailer.ts`** — `isMailerConfigured()` and `sendContactEmail(draft)`. One
  `fetch` to Resend, mirroring `_ai/provider.ts`. Swapping providers means rewriting this file only.
- **`src/app/api/contact/route.ts`** — validate, rate-limit, send. Returns `{ ok: boolean }`.
- **`src/app/_components/ContactSendButton.tsx`** — owns `idle → sending → sent → failed`.
- **`scripts/check-sentinel.ts`** — added to the `check` script in `package.json`.

**Naming**: `_ai/types.ts` already exports `MAX_MESSAGE_CHARS` (500, the chat input cap). The
contact caps must not reuse it — they are `MAX_CONTACT_NAME_CHARS`, `MAX_CONTACT_EMAIL_CHARS`,
`MAX_CONTACT_MESSAGE_CHARS` in `_contact/draft.ts`.

### Changed files

- **`_ai/types.ts`** — `ChatAction` gains `sends?: ContactDraft`, a third mutually exclusive
  variant beside `href` and `opens`.
- **`_ai/knowledge.ts`** — a block in `TONE` teaching the offer, the collection, and both
  sentinels; and the resume line at `:20` rewritten.
- **`_ai/fallback.ts`** — the resume action's label reads from `CHAT.resumeLabel`.
- **`api/chat/route.ts`** — hold-back-and-parse in the stream loop.
- **`_components/FireflyChat.tsx`** — one branch in the action render delegating to
  `ContactSendButton`, plus the auto-open effect and its guard ref.
- **`PORTFOLIO.ts`** — new `CHAT` strings.
- **`.env.example`**, **`package.json`**.

`useChat.ts` is deliberately **not** changed. The auto-open effect fires on the transition where
`isStreaming` goes `true → false` for a reply carrying the resume action — a restored message never
streams, so rehydration cannot trigger it and no `restored` flag or id-seeding is needed.

### `/api/contact` contract

`POST` with `{ name, email, message }`. Always `200` with `{ ok: boolean }` — the client's only
branch is sent-or-not, and a non-200 would give a fetch failure a different shape than a refusal
for no benefit.

Validation, server-side, because a bot can POST here without touching the chat:

| Field | Rule |
|---|---|
| `name` | 1–80 chars after trim |
| `email` | 3–254 chars, matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| `message` | 1–1000 chars after trim |

Rate limiting reuses `createLimiter` from `_ai/limits.ts` with its own instance at
`{ perIpPerHour: 3, sitePerDay: 20 }` — deliberately far tighter than chat's 10/120. Same caveat
the module already documents: in-memory, resets on cold start, shared by no other instance, so it
is a quota guard rather than a gate. The real ceiling is Resend's 100/day.

No captcha. It would mean a new dependency and a visible third-party widget inside a 360px panel,
which is not proportionate for a portfolio.

### The Resend call

```
POST https://api.resend.com/emails
authorization: Bearer ${RESEND_API_KEY}

{
  "from": "Firefly <onboarding@resend.dev>",
  "to": [CONTACT_TO_EMAIL ?? PORTFOLIO.email],
  "reply_to": draft.email,
  "subject": `Portfolio message from ${draft.name}`,
  "text": …
}
```

`reply_to` is the point of the whole thing: hitting reply in Gmail goes to the visitor, not to
Resend. The call is wrapped in the same `AbortController` timeout pattern `api/chat` uses.

## Failure modes

Every way the *send* can fail lands in one place, by design:

| What breaks | What the visitor sees |
|---|---|
| `RESEND_API_KEY` unset | `{ ok: false }` immediately; button → **Email him directly →** |
| Resend 4xx/5xx, or timeout | Same |
| Rate limited | Same |
| Validation fails | Same |

The visitor is never told which of the four. One line covers them all; the real reason goes to
`console.error` for Vercel logs, exactly as `api/chat` does today. The **Email him directly →**
state is the existing `mailto:` action — the feature degrades into what the site already does.

The two ways an *action* can fail to appear degrade differently, and both are silent:

| What breaks | What the visitor sees |
|---|---|
| No `[[CONTACT]]` emitted | A normal reply, no button. Firefly still names the email in prose |
| No `[[RESUME]]` emitted | A normal reply. The nav Resume button is untouched and still works |

`ContactSendButton` disables itself while sending and after a success, so a double-click cannot
send twice. Because the send state lives in component state rather than in the message, a cleared
or reloaded transcript starts a fresh draft — acceptable, and it keeps `chatStorage` untouched.

## Copy

All strings go in `CHAT` in `PORTFOLIO.ts`:

| Key | Value |
|---|---|
| `sendLabel` | `Send it` |
| `sendingLabel` | `Sending…` |
| `sentLabel` | `` `Sent — ${PORTFOLIO.preferred_name} will see it` `` |
| `sendFailedLabel` | `Email him directly` |
| `resumeLabel` | `Open resume` |

`resumeLabel` matches the string already hard-coded at `_ai/fallback.ts:58`; that line changes to
reference `CHAT.resumeLabel` so the two paths cannot drift.

The panel's `privacyNote` stays as-is: no transcript leaves the browser, and the three fields are
handed over deliberately, so "This chat stays in your browser" remains true.

## Prompt changes

`TONE` in `_ai/knowledge.ts` gains a block covering:

- When someone wants to reach Johnny, offer to pass a message along. Do not push it on people who
  did not ask.
- Ask for their name and email. One thing at a time — this is a small popup.
- Never invent, guess, or complete these fields. If they will not give an email, drop it and give
  them Johnny's address instead.
- Once all three are held, read them back in one sentence and end the reply with the sentinel on
  its own final line.
- Never mention the sentinel, never explain it, never emit it in any other circumstance.

And for the resume:

- When someone asks to see, read, download, or get the resume or CV, end the reply with `[[RESUME]]`
  on its own final line. Say something brief first — the reply is still a reply.
- Do not emit it merely because the resume is mentioned in passing, or when answering a question
  the resume happens to contain. Only when they want the document itself.
- The line at `:20` describing the top-right nav button is removed. Firefly opens it now.

The existing "decline lightly" rule for instruction-override attempts already covers attempts to
make Firefly emit sentinels on demand; for contact, the confirm click is the real defence, and for
resume, the blast radius of a coerced `[[RESUME]]` is a dialog the visitor closes.

## Testing

There is no test suite; the convention is `scripts/check-*.ts` under `npm run check`, using
`node:assert/strict`. `scripts/check-sentinel.ts` covers `_ai/sentinel.ts`:

- A clean `[[CONTACT …]]` parses; `visible` excludes it and is right-trimmed
- A clean `[[RESUME]]` parses to `{ kind: 'resume' }`
- A reply with no sentinel returns the text unchanged and a `null` command
- An unterminated `[[CONTACT` yields `null` and a `visible` stopping before it
- A `[[` that starts ordinary text is **not** held back
- `heldPrefixLength` holds `…thanks [[CON` and releases `…thanks [[x`
- Two sentinels — the first wins
- Fewer than three fields, an empty name, a malformed email, and an over-length message each
  yield `null`
- A `|` inside the message body does not silently truncate it

`mailer.ts`, the route and the auto-open effect are not covered — I/O and React, matching how
`provider.ts` and `api/chat` are already untested here. Auto-open is verified by hand: ask for the
resume, dismiss it, reload the page and confirm it does not reopen.

## Setup, once

1. Sign up at resend.com with `cuongdn2001@gmail.com`.
2. API Keys → Create → copy.
3. Add `RESEND_API_KEY` to `.env.local` and to Vercel's environment variables.

No domain, no DNS. `CONTACT_TO_EMAIL` is optional and defaults to `PORTFOLIO.email`; on the free
tier it must be the Resend account's own address.
