# /ask Cache + Rail + Contact Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the spec at `docs/superpowers/specs/2026-08-09-ask-cache-contact-design.md`: a Vercel Blob answer cache with recruiter seeds, a reusable snap-scrolling rail slide format, and the two-input contact form on /ask.

**Architecture:** Pure matching/parsing modules (`cache.ts`, extended `slides.ts`/`sentinel.ts`) verified by check scripts; a server-only blob store module with in-memory TTL; the chat route consults the cache before the provider and writes clean first-turn answers back via `after()`; new UI components (`SlideRail`, `RailSlide`, reworked `ProjectsSlide`, `ContactFormCard`) slot into the existing slide switch and action row.

**Tech Stack:** Existing stack + `@vercel/blob` (already installed). No new dependencies.

## Global Constraints

- Branch `ask-route`. Verification harness: `npm run check` (tsx scripts), `npm run build`, `npm run lint`.
- The main-page chat surface stays byte-identical on the wire: no cache lookups, no `form` actions, no new events. Every pre-existing check assertion passes untouched — with ONE sanctioned exception named in Task 3 (a `splitReply` assertion whose input's meaning the spec deliberately changes).
- All visitor-facing copy in `PORTFOLIO.ts` (`ASK`/`CHAT` blocks). Design language: slate-900/800, teal accent pills, small-amplitude motion, `useReducedMotion` honored.
- Safe-failure contract: malformed model output, corrupt blob JSON, missing token — everything degrades (Editorial slide / empty cache / silent no-op), never throws to the visitor.
- No `BLOB_READ_WRITE_TOKEN` ⇒ cache lookup, write-back, and seeding are silent no-ops; the AI path is unaffected.
- Privacy: cache stores only normalized questions and firefly answers — never names, emails, session ids, or free-form visitor text beyond the question itself.

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/app/_ai/cache.ts` | create | Pure: entry shape, normalize, match, write-back gate, add/evict |
| `scripts/check-cache.ts` | create | Assertions for cache.ts |
| `src/app/_ai/slides.ts` | modify | `'rail'` format, `[[SLIDE RAIL]]` tag, `parseRailCards` |
| `scripts/check-slides.ts` | modify | Rail assertions |
| `src/utils/askStorage.ts` | modify | `'rail'` accepted by turn validation |
| `src/app/_ai/sentinel.ts` | modify | `contact-form` command |
| `scripts/check-sentinel.ts` | modify | contact-form assertions |
| `src/app/_ai/types.ts` | modify | `ChatAction.form` |
| `src/app/PORTFOLIO.ts` | modify | ASK form labels |
| `src/app/_ai/knowledge.ts` | modify | SLIDE_RULES: RAIL + form-based contact |
| `src/app/_ai/cacheStore.ts` | create | Server-only blob IO, TTL memory, hit persist throttle |
| `src/app/_ai/seeds.ts` | create | ~20 seed entries |
| `scripts/check-seeds.ts` | create | Seed shape/caps assertions |
| `scripts/seed-ask-cache.ts` | create | Check-first migration (`npm run seed:ask`, `--dry`) |
| `package.json` | modify | check chain + `seed:ask` script |
| `src/app/api/chat/route.ts` | modify | Cache-first serving, write-back, contact-form action |
| `src/app/ask/_components/SlideRail.tsx` | create | Shared snap-scroll card rail |
| `src/app/ask/_components/ProjectsSlide.tsx` | modify | Rework onto SlideRail |
| `src/app/ask/_components/RailSlide.tsx` | create | Model-driven rail format |
| `src/app/ask/page.tsx` | modify | Slide switch gains `'rail'` |
| `src/app/ask/_components/ContactFormCard.tsx` | create | Two-input form + confirm + send |
| `src/app/ask/_components/SlideAction.tsx` | modify | Render form action |
| `CLAUDE.md` | modify | Brief cache/rail/form notes (final task) |

Dependencies: Tasks 1–4 are mutually independent (fan out). Task 5 needs 1. Task 6 needs 1+3+4+5. Task 7 needs 2. Task 8 needs 3+4. Task 9 needs everything. `package.json` is touched by Tasks 1 and 5 — land sequentially.

---

### Task 1: Cache matching module (`cache.ts`)

**Files:** Create `src/app/_ai/cache.ts`, `scripts/check-cache.ts`; modify `package.json` (append ` && tsx scripts/check-cache.ts` to `check`).

**Interfaces produced (later tasks import verbatim):**
- `interface CacheEntry { id: string; phrasings: string[]; keywords: string[]; format: SlideFormat; answer: string; action: 'resume' | 'contact-form' | null; recap: string; seeded: boolean; hits: number; updatedAt: number }`
- `CACHE_PATHNAME = 'ask-cache/v1.json'`, `MAX_CACHE_ENTRIES = 200`
- `normalizeQuestion(q: string): string`
- `deriveKeywords(q: string): string[]`
- `matchCache(entries: CacheEntry[], question: string): CacheEntry | null`
- `canWriteBack(args: { question: string; priorFireflyTurns: number; answer: string; action: unknown }): boolean`
- `entryFromAnswer(question: string, format: SlideFormat, answer: string, recap: string | null, now?: number): CacheEntry`
- `addEntry(entries: CacheEntry[], entry: CacheEntry): CacheEntry[]`
- `isCacheEntry(value: unknown): value is CacheEntry`

- [ ] **Step 1: Write the failing check script** — create `scripts/check-cache.ts`:

```ts
import assert from 'node:assert/strict';
import {
  addEntry,
  canWriteBack,
  deriveKeywords,
  entryFromAnswer,
  isCacheEntry,
  matchCache,
  MAX_CACHE_ENTRIES,
  normalizeQuestion,
  type CacheEntry,
} from '../src/app/_ai/cache';

const entry = (over: Partial<CacheEntry>): CacheEntry => ({
  id: 'x',
  phrasings: [],
  keywords: [],
  format: 'editorial',
  answer: 'Headline.',
  action: null,
  recap: 'r',
  seeded: false,
  hits: 0,
  updatedAt: 1,
  ...over,
});

// --- normalizeQuestion ------------------------------------------------------
assert.equal(normalizeQuestion('  Who IS Johnny?!  '), 'who is johnny');
assert.equal(normalizeQuestion("What's his stack?"), 'whats his stack');
// Idempotent — normalizing a normalized string changes nothing.
assert.equal(normalizeQuestion(normalizeQuestion('Tell me about Johnny')), 'tell me about johnny');

// --- deriveKeywords: content words only -------------------------------------
assert.deepEqual(deriveKeywords('What technologies does he use?'), ['technologies', 'use']);
assert.deepEqual(deriveKeywords('Tell me more'), []);

// --- matchCache: exact phrasing wins ----------------------------------------
const who = entry({ id: 'who', phrasings: ['who is johnny', 'tell me about johnny'], keywords: ['who', 'about', 'introduce', 'background'] });
const skills = entry({ id: 'skills', phrasings: ['whats his stack'], keywords: ['tech', 'technologies', 'stack', 'skills', 'tools', 'languages', 'use'] });
const entries = [who, skills];

assert.equal(matchCache(entries, 'Who is Johnny?'), who);
assert.equal(matchCache(entries, 'TELL me about Johnny'), who);

// --- matchCache: keyword scoring over the threshold -------------------------
assert.equal(matchCache(entries, 'What technologies and tools does he use?'), skills);

// --- matchCache: follow-ups and vague questions can never match -------------
assert.equal(matchCache(entries, 'tell me more'), null);
assert.equal(matchCache(entries, 'why?'), null);
assert.equal(matchCache(entries, 'and then what happened'), null);
// One keyword alone is not confidence.
assert.equal(matchCache(entries, 'does he use vim'), null);
// Empty input, empty entries.
assert.equal(matchCache(entries, '   '), null);
assert.equal(matchCache([], 'who is johnny'), null);

// --- canWriteBack gates ------------------------------------------------------
const ok = { question: 'what does johnny think about testing', priorFireflyTurns: 0, answer: 'He tests what matters.\n- check scripts', action: null };
assert.equal(canWriteBack(ok), true);
assert.equal(canWriteBack({ ...ok, priorFireflyTurns: 1 }), false);            // not first turn
assert.equal(canWriteBack({ ...ok, action: { label: 'x' } }), false);          // carried an action
assert.equal(canWriteBack({ ...ok, question: 'hi' }), false);                  // too short
assert.equal(canWriteBack({ ...ok, question: 'email me at a@b.co about him' }), false); // email
assert.equal(canWriteBack({ ...ok, question: 'see http://x.co for context' }), false);  // url
assert.equal(canWriteBack({ ...ok, answer: 'x'.repeat(601) }), false);         // answer cap
assert.equal(canWriteBack({ ...ok, answer: '' }), false);                      // no headline

// --- entryFromAnswer + addEntry ---------------------------------------------
const fresh = entryFromAnswer('What does Johnny think about testing?', 'editorial', 'He tests what matters.', null, 42);
assert.equal(fresh.phrasings[0], 'what does johnny think about testing');
assert.ok(fresh.keywords.includes('testing'));
assert.equal(fresh.recap, 'He tests what matters.');
assert.equal(fresh.seeded, false);
assert.equal(fresh.updatedAt, 42);

// A phrasing collision is a no-op — never overwrite an existing answer.
assert.equal(addEntry([who], entry({ phrasings: ['who is johnny'] })).length, 1);

// Eviction: oldest unseeded goes first; seeded entries are never evicted.
const seeded = entry({ id: 'seed', seeded: true, updatedAt: 0, phrasings: ['seeded q'] });
const crowd = Array.from({ length: MAX_CACHE_ENTRIES - 1 }, (_, i) =>
  entry({ id: `e${i}`, updatedAt: i + 1, phrasings: [`crowd q ${i}`] }),
);
const grown = addEntry([seeded, ...crowd], entry({ id: 'new', updatedAt: 999, phrasings: ['brand new q'] }));
assert.equal(grown.length, MAX_CACHE_ENTRIES);
assert.ok(grown.some((e) => e.id === 'seed'));
assert.ok(!grown.some((e) => e.id === 'e0'));
assert.ok(grown.some((e) => e.id === 'new'));

// --- isCacheEntry ------------------------------------------------------------
assert.equal(isCacheEntry(who), true);
assert.equal(isCacheEntry({ ...who, answer: 42 }), false);
assert.equal(isCacheEntry({ ...who, format: 'banana' }), false);
assert.equal(isCacheEntry(null), false);

console.log('check-cache: ok');
```

- [ ] **Step 2: Run to verify failure** — `npx tsx scripts/check-cache.ts` → module not found.

- [ ] **Step 3: Implement `src/app/_ai/cache.ts`:**

```ts
import type { SlideFormat } from './slides';

/**
 * The /ask answer cache's pure half: entry shape, question matching, and the
 * write-back gate. No IO here — this module is shared with check scripts and
 * must stay importable anywhere.
 */

export const CACHE_PATHNAME = 'ask-cache/v1.json';
export const MAX_CACHE_ENTRIES = 200;

/** Questions this short are conversational glue, never cacheable lookups. */
const MIN_QUESTION_CHARS = 8;
const MAX_QUESTION_CHARS = 120;
const MAX_ANSWER_CHARS = 600;

export interface CacheEntry {
  id: string;
  /** Normalized exact question strings that map straight to this answer. */
  phrasings: string[];
  /** Content words for scored matching when no phrasing matches exactly. */
  keywords: string[];
  format: SlideFormat;
  /** Slide body text: headline line, then item lines. */
  answer: string;
  action: 'resume' | 'contact-form' | null;
  recap: string;
  /** Seeds are never evicted and the seeder never overwrites them. */
  seeded: boolean;
  hits: number;
  updatedAt: number;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'about', 'can', 'could', 'do', 'does', 'did',
  'for', 'get', 'has', 'have', 'he', 'her', 'him', 'his', 'how', 'i', 'in',
  'is', 'it', 'its', 'johnny', 'johnnys', 'know', 'like', 'me', 'more', 'my',
  'of', 'on', 'or', 'please', 'she', 'show', 'so', 'some', 'tell', 'that',
  'the', 'their', 'them', 'then', 'there', 'they', 'this', 'to', 'us', 'was',
  'we', 'what', 'whats', 'when', 'where', 'which', 'who', 'whos', 'why',
  'will', 'with', 'would', 'you', 'your',
]);

export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUESTION_CHARS);
}

/** The question's content words — what scored matching runs on. */
export function deriveKeywords(question: string): string[] {
  return normalizeQuestion(question)
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/**
 * Exact phrasing first; else keyword scoring. The thresholds are the safety
 * property: a hit needs at least two matched content words AND a majority of
 * the question's content words matched, so conversational follow-ups ("tell
 * me more", "why") — which have zero or one content word — can never match.
 */
export function matchCache(entries: CacheEntry[], question: string): CacheEntry | null {
  const normalized = normalizeQuestion(question);
  if (!normalized) return null;

  for (const entry of entries) {
    if (entry.phrasings.includes(normalized)) return entry;
  }

  const tokens = deriveKeywords(question);
  if (tokens.length < 2) return null;

  let best: CacheEntry | null = null;
  let bestMatched = 0;
  for (const entry of entries) {
    const keywords = new Set(entry.keywords);
    const matched = tokens.filter((token) => keywords.has(token)).length;
    if (matched >= 2 && matched / tokens.length >= 0.6 && matched > bestMatched) {
      best = entry;
      bestMatched = matched;
    }
  }
  return best;
}

/**
 * The shared-cache safety gate: only a conversation's FIRST answer, clean and
 * action-free, may be served to other visitors. Questions carrying emails or
 * links are someone's contact attempt, not a lookup.
 */
export function canWriteBack(args: {
  question: string;
  priorFireflyTurns: number;
  answer: string;
  action: unknown;
}): boolean {
  const normalized = normalizeQuestion(args.question);
  return (
    args.priorFireflyTurns === 0 &&
    args.action === null &&
    normalized.length >= MIN_QUESTION_CHARS &&
    !/[@]|https?:|www\./i.test(args.question) &&
    args.answer.trim().length > 0 &&
    args.answer.length <= MAX_ANSWER_CHARS
  );
}

export function entryFromAnswer(
  question: string,
  format: SlideFormat,
  answer: string,
  recap: string | null,
  now: number = Date.now(),
): CacheEntry {
  const normalized = normalizeQuestion(question);
  return {
    id: `wb-${now}-${normalized.slice(0, 24).replace(/\s/g, '-')}`,
    phrasings: [normalized],
    keywords: deriveKeywords(question),
    format,
    answer,
    action: null,
    recap: recap ?? answer.split('\n')[0].slice(0, 150),
    seeded: false,
    hits: 0,
    updatedAt: now,
  };
}

/** Phrasing collisions are no-ops; growth beyond the cap evicts oldest unseeded. */
export function addEntry(entries: CacheEntry[], entry: CacheEntry): CacheEntry[] {
  const taken = new Set(entries.flatMap((e) => e.phrasings));
  if (entry.phrasings.some((p) => taken.has(p))) return entries;

  const next = [...entries, entry];
  if (next.length <= MAX_CACHE_ENTRIES) return next;

  const unseeded = next
    .filter((e) => !e.seeded)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const evict = new Set(unseeded.slice(0, next.length - MAX_CACHE_ENTRIES).map((e) => e.id));
  return next.filter((e) => !evict.has(e.id));
}

const FORMATS: SlideFormat[] = ['editorial', 'list', 'rail', 'experience', 'projects'];

/** Blob JSON is visitor-adjacent input: validate every entry before trusting it. */
export function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    Array.isArray(v.phrasings) && v.phrasings.every((p) => typeof p === 'string') &&
    Array.isArray(v.keywords) && v.keywords.every((k) => typeof k === 'string') &&
    FORMATS.includes(v.format as SlideFormat) &&
    typeof v.answer === 'string' &&
    (v.action === null || v.action === 'resume' || v.action === 'contact-form') &&
    typeof v.recap === 'string' &&
    typeof v.seeded === 'boolean' &&
    typeof v.hits === 'number' &&
    typeof v.updatedAt === 'number'
  );
}
```

Note: this imports `SlideFormat` including `'rail'` — Task 2 adds it. If Task 2 hasn't landed yet in your checkout, the `FORMATS` array will fail the type check; in that case coordinate with the controller (Task 2 is independent and may simply need to land first). Do not weaken the type to `string`.

- [ ] **Step 4: Run the check** — `npx tsx scripts/check-cache.ts` → `check-cache: ok`.
- [ ] **Step 5: Register in package.json's `check` chain; run `npm run check`.**
- [ ] **Step 6: Commit** — `git add src/app/_ai/cache.ts scripts/check-cache.ts package.json && git commit -m "feat: ask answer cache matching module"`

---

### Task 2: Rail format parsing (`slides.ts`) + storage acceptance

**Files:** Modify `src/app/_ai/slides.ts`, `scripts/check-slides.ts`, `src/utils/askStorage.ts`, `scripts/check-ask-storage.ts`.

**Interfaces produced:** `SlideFormat` gains `'rail'`; `[[SLIDE RAIL]]` recognized by `scanLeadingTag`; `interface RailCard { title: string; body: string }`; `parseRailCards(text: string): { headline: string; cards: RailCard[] }`.

- [ ] **Step 1: Append failing assertions to `scripts/check-slides.ts`** (before the final console.log; extend the import line with `parseRailCards`):

```ts
// --- rail format -------------------------------------------------------------
assert.deepEqual(scanLeadingTag('[[SLIDE RAIL]]\nFour roles.\n- iMSX | Enterprise systems.', false).format, 'rail');
assert.equal(scanLeadingTag('[[SLIDE RA', false).format, null); // viable prefix waits

assert.deepEqual(parseRailCards('Four roles, five years.\n- iMSX | Enterprise systems end to end.\n- WebVine | Licence management from scratch.'), {
  headline: 'Four roles, five years.',
  cards: [
    { title: 'iMSX', body: 'Enterprise systems end to end.' },
    { title: 'WebVine', body: 'Licence management from scratch.' },
  ],
});
// A line without the separator is a body-only card.
assert.deepEqual(parseRailCards('H.\n- just a sentence with no title'), {
  headline: 'H.',
  cards: [{ title: '', body: 'just a sentence with no title' }],
});
// Empty bodies are dropped; a headline-only reply has zero cards.
assert.deepEqual(parseRailCards('H.\n- Title |'), { headline: 'H.', cards: [] });
assert.deepEqual(parseRailCards('Just a headline.'), { headline: 'Just a headline.', cards: [] });
// A pipe in the body is content, not a second separator.
assert.deepEqual(parseRailCards('H.\n- Ops | infra | both').cards, [{ title: 'Ops', body: 'infra | both' }]);
```

- [ ] **Step 2: Run to verify failure** — `npx tsx scripts/check-slides.ts`.

- [ ] **Step 3: Implement in `src/app/_ai/slides.ts`:**
  1. `export type SlideFormat = 'editorial' | 'list' | 'rail' | 'experience' | 'projects';`
  2. Add `'[[SLIDE RAIL]]': 'rail',` to `TAGS`.
  3. Append:

```ts
export interface RailCard {
  title: string;
  body: string;
}

/**
 * Rail bodies are "- Title | detail" lines. Only the FIRST pipe separates —
 * a pipe inside the detail is the model's prose, not protocol. Lines without
 * a pipe are body-only cards; lines whose body is empty are dropped, so a
 * reply that never card-shapes yields zero cards and the caller can degrade
 * to the editorial rendering.
 */
export function parseRailCards(text: string): { headline: string; cards: RailCard[] } {
  const { headline, items } = parseSlideBody(text);
  const cards = items
    .map((item) => {
      const split = item.indexOf('|');
      if (split === -1) return { title: '', body: item.trim() };
      return { title: item.slice(0, split).trim(), body: item.slice(split + 1).trim() };
    })
    .filter((card) => card.body.length > 0);
  return { headline, cards };
}
```

- [ ] **Step 4: Accept `'rail'` in `src/utils/askStorage.ts`** — the turn validator's format list (`SLIDE_FORMATS` or the inline check inside `isValidTurn`) gains `'rail'`. Append to `scripts/check-ask-storage.ts` (before its console.log):

```ts
// A rail-format turn survives the round trip — the validator knows the format.
const railStore = memoryStorage();
saveAsk(railStore, newSessionId(), [{ ...turn, id: 'rail-turn', format: 'rail' as const }]);
assert.equal(loadAsk(railStore).turns[0]?.format, 'rail');
```

- [ ] **Step 5: Run `npx tsx scripts/check-slides.ts`, `npx tsx scripts/check-ask-storage.ts`, then `npm run check`** — all green.
- [ ] **Step 6: Commit** — `git add src/app/_ai/slides.ts scripts/check-slides.ts src/utils/askStorage.ts scripts/check-ask-storage.ts && git commit -m "feat: rail slide format parsing"`

---

### Task 3: Contact-form sentinel + action type

**Files:** Modify `src/app/_ai/sentinel.ts`, `scripts/check-sentinel.ts`, `src/app/_ai/types.ts`.

**Interfaces produced:** `SentinelCommand` gains `{ kind: 'contact-form'; draft: string }`; `ChatAction` gains `form?: { draft: string }`.

- [ ] **Step 1: Append failing assertions to `scripts/check-sentinel.ts`:**

```ts
// --- contact-form: the /ask form flow ----------------------------------------
// Bare CONTACT is intent with nothing drafted yet.
assert.deepEqual(splitReply('One line.\n[[CONTACT]]').commands, [{ kind: 'contact-form', draft: '' }]);
// A payload that is not a 3-field draft is the visitor's message, drafted.
assert.deepEqual(splitReply('Got it.\n[[CONTACT wants to talk about a role]]').commands, [
  { kind: 'contact-form', draft: 'wants to talk about a role' },
]);
// Recap + form on one reply still both parse.
assert.deepEqual(splitReply('Got it.\n[[RECAP Wants to reach him.]]\n[[CONTACT about a role]]').commands, [
  { kind: 'recap', text: 'Wants to reach him.' },
  { kind: 'contact-form', draft: 'about a role' },
]);
// An ATTEMPTED full draft (two-plus pipes) that fails validation stays
// suppressed — it must not leak emails into a form prefixed as a message.
assert.deepEqual(splitReply('x\n[[CONTACT  | s@acme.com | hello]]').commands, []);
// Legacy 3-field drafts still parse as the chat surface's contact command.
assert.deepEqual(
  splitReply('x\n[[CONTACT Sarah | sarah@acme.com | About work]]').commands[0],
  { kind: 'contact', draft: { name: 'Sarah', email: 'sarah@acme.com', message: 'About work' } },
);
// Over-long drafts are malformed.
assert.deepEqual(splitReply(`x\n[[CONTACT ${'a'.repeat(1001)}]]`).commands, []);
// The legacy single-command view never surfaces the form kind.
assert.equal(splitSentinel('x\n[[CONTACT wants to chat]]').command, null);
```

(The pre-existing legacy assertions — including `[[CONTACT Sarah | sarah@acme.com]]` two-field suppression in `splitSentinel` — must keep passing untouched, with ONE sanctioned update: the existing `skipMalformed` assertion feeds `splitReply` a one-pipe CONTACT body (`[[CONTACT only-two | fields]]`), which under the new rules is a valid contact-form command, not a malformed member. Update that assertion to:

```ts
assert.deepEqual(skipMalformed.commands, [
  { kind: 'contact-form', draft: 'only-two | fields' },
  { kind: 'recap', text: 'Still summarised.' },
]);
```

and add a one-line comment noting the meaning change. No other pre-existing assertion may change.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement in `src/app/_ai/sentinel.ts`:**
  1. Import the cap: `import { validateDraft, MAX_CONTACT_MESSAGE_CHARS, type ContactDraft } from '../_contact/draft';`
  2. Extend the union: `| { kind: 'contact-form'; draft: string }`.
  3. Replace `parseCommand`'s CONTACT branch:

```ts
  if (body.startsWith('CONTACT')) {
    const payload = body.slice('CONTACT'.length);
    const draft = parseContact(payload);
    if (draft) return { kind: 'contact', draft };

    // Not a valid 3-field draft. Two or more pipes means the model TRIED the
    // full shape and got it wrong — suppress it rather than leak fields into
    // a message prefill. Anything else is the /ask form flow: the payload
    // (possibly empty) is the visitor's drafted message.
    const pipes = (payload.match(/\|/g) ?? []).length;
    if (pipes >= 2) return null;
    const text = payload.trim();
    if (text.length > MAX_CONTACT_MESSAGE_CHARS) return null;
    return { kind: 'contact-form', draft: text };
  }
```

  4. In `splitSentinel`'s walk, the legacy contract must not see the new kind. Where the walk returns a found non-recap command, treat `contact-form` exactly like the old malformed-contact case:

```ts
    if (command && command.kind !== 'recap') {
      // The form kind postdates this legacy view. Under the old contract a
      // CONTACT without a full valid draft suppressed the action entirely.
      if (command.kind === 'contact-form') return { visible, command: null };
      return { visible, command };
    }
```

- [ ] **Step 4: Add to `ChatAction` in `src/app/_ai/types.ts`:**

```ts
  /** The /ask contact form, with whatever message the model already drafted. */
  form?: { draft: string };
```

- [ ] **Step 5: Run `npx tsx scripts/check-sentinel.ts` then `npm run check` + `npm run build`** — all green.
- [ ] **Step 6: Commit** — `git add src/app/_ai/sentinel.ts scripts/check-sentinel.ts src/app/_ai/types.ts && git commit -m "feat: contact-form sentinel command"`

---

### Task 4: ASK copy + SLIDE_RULES prompt update

**Files:** Modify `src/app/PORTFOLIO.ts`, `src/app/_ai/knowledge.ts`.

**Interfaces produced:** new `ASK` fields (below) — Tasks 6/8 read them verbatim.

- [ ] **Step 1: Add to the `ASK` block in `PORTFOLIO.ts`** (after `navLabel`, keeping the doc-comment style):

```ts
  /** Card title above the /ask contact form. */
  formTitle: `Send ${PORTFOLIO.preferred_name} a message`,
  nameLabel: 'Your name',
  emailLabel: 'Your email',
  messageLabel: 'Your message',
  /** Placeholder when the model drafted nothing — the form asks instead. */
  messagePrompt: 'What should he know?',
  /** Read-back heading on the confirm step. */
  confirmTitle: `Send this to ${PORTFOLIO.preferred_name}?`,
  confirmLabel: 'Send it',
  editLabel: 'Keep editing',
```

(Sending/sent/failed states reuse `CHAT.sendingLabel` / `CHAT.sentLabel` / `CHAT.sendFailedLabel` — no duplication.)

- [ ] **Step 2: Update `SLIDE_RULES` in `knowledge.ts`.** Two edits, verbatim:

  1. After the `[[SLIDE LIST]]` paragraph, insert:

```
[[SLIDE RAIL]]
When the answer is a set of 3 to 6 items that each need a sentence of real detail — roles, project stories, reasons. After the headline, each line is:
- Title | one or two short sentences about it
Use LIST when items are one to three words; use RAIL when each item needs explaining.
```

  2. Replace the final paragraph of SLIDE_RULES (currently "The resume and message rules above still apply on their own lines. Order at the end of a reply: recap line, then any action line.") with:

```
The resume rule above still applies on its own line. Passing a message works differently here: a form on the page collects their name and email, so never ask for either. When someone wants to reach Johnny, answer in one short line and end with:
[[CONTACT]]
If they already said what they want him to know, put that message inside instead:
[[CONTACT their message, in their words]]
Order at the end of a reply: recap line, then any action line.
```

- [ ] **Step 3: Verify** — `npm run check` (knowledge checks exercise the chat default — must be untouched) and `npm run build`.
- [ ] **Step 4: Commit** — `git add src/app/PORTFOLIO.ts src/app/_ai/knowledge.ts && git commit -m "feat: ask form copy and rail/contact prompt rules"`

---

### Task 5: Blob store, seeds, migration script

**Files:** Create `src/app/_ai/cacheStore.ts`, `src/app/_ai/seeds.ts`, `scripts/check-seeds.ts`, `scripts/seed-ask-cache.ts`; modify `package.json` (check chain + `"seed:ask": "tsx scripts/seed-ask-cache.ts"`).

**Interfaces produced:**
- `loadCacheEntries(): Promise<CacheEntry[]>` — TTL-cached, [] without token/on any failure
- `serveHitEffects(entry: CacheEntry): void` — bump hits in memory; persist at most once per TTL window
- `writeBackAnswer(question: string, format: SlideFormat, answer: string, recap: string | null): Promise<void>`
- `SEED_ENTRIES: CacheEntry[]` from seeds.ts

- [ ] **Step 1: Implement `src/app/_ai/cacheStore.ts`:**

```ts
import { head, put } from '@vercel/blob';
import {
  addEntry,
  CACHE_PATHNAME,
  canWriteBack,
  entryFromAnswer,
  isCacheEntry,
  type CacheEntry,
} from './cache';
import type { SlideFormat } from './slides';

/**
 * The cache's IO half. Server-only. Every path degrades to "no cache": a
 * missing token, a 404, corrupt JSON — the AI answers as if this file did
 * not exist. Nothing here may throw into the route.
 */

const TTL_MS = 60_000;

let memory: { at: number; entries: CacheEntry[] } | null = null;
let lastHitPersist = 0;

function hasToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function fetchIndex(): Promise<CacheEntry[]> {
  const meta = await head(CACHE_PATHNAME);
  const response = await fetch(meta.downloadUrl);
  if (!response.ok) return [];
  const parsed = (await response.json()) as { entries?: unknown[] };
  if (!Array.isArray(parsed?.entries)) return [];
  return parsed.entries.filter(isCacheEntry);
}

export async function loadCacheEntries(): Promise<CacheEntry[]> {
  if (!hasToken()) return [];
  const now = Date.now();
  if (memory && now - memory.at < TTL_MS) return memory.entries;
  try {
    const entries = await fetchIndex();
    memory = { at: now, entries };
    return entries;
  } catch {
    // 404 on first ever run, network trouble, corrupt JSON — all the same:
    // no cache this request. Keep a short-lived empty memory so a hard-down
    // blob store is not re-fetched on every request.
    memory = { at: now, entries: [] };
    return [];
  }
}

function persist(entries: CacheEntry[]): Promise<unknown> {
  memory = { at: Date.now(), entries };
  return put(CACHE_PATHNAME, JSON.stringify({ version: 1, entries }), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
    allowOverwrite: true,
  }).catch((err) => console.error('cacheStore: persist failed', err));
}

/**
 * Hit bookkeeping. Counts always move in memory; the blob write is throttled
 * to once per TTL window so a burst of hits cannot turn into a burst of PUTs.
 */
export function serveHitEffects(entry: CacheEntry): void {
  entry.hits += 1;
  if (!hasToken() || !memory) return;
  const now = Date.now();
  if (now - lastHitPersist < TTL_MS) return;
  lastHitPersist = now;
  void persist(memory.entries);
}

export async function writeBackAnswer(
  question: string,
  format: SlideFormat,
  answer: string,
  recap: string | null,
): Promise<void> {
  if (!hasToken()) return;
  try {
    const entries = await loadCacheEntries();
    const entry = entryFromAnswer(question, format, answer, recap);
    const grown = addEntry(entries, entry);
    if (grown === entries) return; // phrasing collision — nothing new to save
    await persist(grown);
  } catch (err) {
    console.error('cacheStore: write-back failed', err);
  }
}

export { canWriteBack };
```

- [ ] **Step 2: Implement `src/app/_ai/seeds.ts`** — `SEED_ENTRIES: CacheEntry[]` with the spec's ~20 entries. Every entry: `seeded: true, hits: 0, updatedAt: 0, action` per the spec table, `phrasings` already normalized (lowercase, no punctuation), answers in the firefly's voice within slide caps (headline ≤ 8 words, ≤ 3 `- ` fragments / ≤ 8 list lines), built from `PORTFOLIO` imports where the facts exist there. The spec's table is binding scope: ids `who-is-johnny, resume, experience, current-role, skills, databases, cloud, projects, education, location, availability, salary, work-rights, remote, contact, strengths, why-hire, github, fun-fact, ai-tools`. Representative entries to copy exactly (write the rest in the same register):

```ts
import { PORTFOLIO, TECH_SERVICES } from '../PORTFOLIO';
import type { CacheEntry } from './cache';

/** A seed in one line: everything shared, only the interesting fields vary. */
const seed = (
  entry: Pick<CacheEntry, 'id' | 'phrasings' | 'keywords' | 'format' | 'answer' | 'recap'> &
    Partial<Pick<CacheEntry, 'action'>>,
): CacheEntry => ({ action: null, seeded: true, hits: 0, updatedAt: 0, ...entry });

export const SEED_ENTRIES: CacheEntry[] = [
  seed({
    id: 'who-is-johnny',
    phrasings: ['who is johnny', 'tell me about johnny', 'who is he', 'tell me about him', 'introduce johnny', 'who is duc nguyen'],
    keywords: ['who', 'about', 'introduce', 'background', 'himself'],
    format: 'editorial',
    answer: `Software engineer who owns things end to end.\n- 3 years shipping production systems\n- finance, advertising compliance, NDIS, insurance\n- based in Sydney, currently at iMSX`,
    recap: 'Asked who Johnny is; software engineer, end-to-end, Sydney.',
  }),
  seed({
    id: 'resume',
    phrasings: ['can i see his resume', 'show me his resume', 'open resume', 'resume', 'cv', 'show me his cv', 'download resume', 'can i see his cv'],
    keywords: ['resume', 'cv', 'download'],
    format: 'editorial',
    answer: 'Full resume, one click away.',
    recap: 'Asked for the resume; opened it.',
    action: 'resume',
  }),
  seed({
    id: 'experience',
    phrasings: ['whats his experience', 'what is his experience', 'his experience', 'work history', 'walk me through his work history', 'his career', 'past roles', 'where has he worked'],
    keywords: ['experience', 'history', 'roles', 'career', 'worked', 'jobs'],
    format: 'experience',
    answer: 'Four roles, from rivers to enterprise.',
    recap: 'Asked about experience; showed the timeline.',
  }),
  seed({
    id: 'projects',
    phrasings: ['what has he built', 'show me his projects', 'his projects', 'side projects', 'what did he build'],
    keywords: ['projects', 'built', 'building', 'apps', 'portfolio'],
    format: 'projects',
    answer: 'Four builds, all shipped to real users.',
    recap: 'Asked about projects; showed the project rail.',
  }),
  seed({
    id: 'skills',
    phrasings: ['what tech does he use', 'whats his stack', 'his skills', 'what technologies does he use', 'is he full stack', 'what languages does he know'],
    keywords: ['tech', 'technologies', 'stack', 'skills', 'tools', 'languages', 'use', 'fullstack'],
    format: 'list',
    answer: `His toolbox, most-used first.\n${PORTFOLIO.techs.map((t) => `- ${t}`).join('\n')}`,
    recap: 'Asked about his stack; listed the main technologies.',
  }),
  seed({
    id: 'salary',
    phrasings: ['salary expectations', 'what are his salary expectations', 'what are his rates', 'how much does he cost', 'what does he charge'],
    keywords: ['salary', 'rate', 'rates', 'compensation', 'pay', 'cost', 'charge', 'expectations'],
    format: 'editorial',
    answer: `One for ${PORTFOLIO.preferred_name} himself.\n- I only know what he builds, not what he charges\n- ask him directly — takes a minute`,
    recap: 'Asked about salary; pointed at the contact form.',
    action: 'contact-form',
  }),
  seed({
    id: 'contact',
    phrasings: ['how do i reach him', 'how can i contact him', 'contact johnny', 'get in touch', 'i want to talk to him', 'i want to hire him', 'how do i contact johnny'],
    keywords: ['contact', 'reach', 'email', 'talk', 'hire', 'message', 'touch'],
    format: 'editorial',
    answer: 'Right here — I pass messages along.',
    recap: 'Wanted to reach Johnny; opened the form.',
    action: 'contact-form',
  }),
  // …the remaining entries (current-role, databases, cloud via TECH_SERVICES.AWS,
  // education [Bachelor of Computer Science (Honours), UTS, First Class Honours],
  // location [Sydney, NSW], availability, work-rights, remote [all three:
  // honest "best asked directly" + action: 'contact-form'], strengths, why-hire
  // [humble register, no hype words], github [mentions the GitHub profile link
  // on the main page], fun-fact [rebuilt this site more times than he admits],
  // ai-tools [Claude Code in his daily workflow]) follow the same register.
];
```

- [ ] **Step 3: Write `scripts/check-seeds.ts`:**

```ts
import assert from 'node:assert/strict';
import { isCacheEntry } from '../src/app/_ai/cache';
import { normalizeQuestion } from '../src/app/_ai/cache';
import { SEED_ENTRIES } from '../src/app/_ai/seeds';

assert.ok(SEED_ENTRIES.length >= 18, `expected >= 18 seeds, got ${SEED_ENTRIES.length}`);

const ids = SEED_ENTRIES.map((e) => e.id);
assert.equal(new Set(ids).size, ids.length, 'seed ids must be unique');
for (const required of ['who-is-johnny', 'resume', 'experience', 'projects', 'skills', 'contact', 'salary', 'availability']) {
  assert.ok(ids.includes(required), `missing required seed: ${required}`);
}

const phrasings = SEED_ENTRIES.flatMap((e) => e.phrasings);
assert.equal(new Set(phrasings).size, phrasings.length, 'phrasings must not collide across seeds');

for (const entry of SEED_ENTRIES) {
  assert.ok(isCacheEntry(entry), `malformed seed: ${entry.id}`);
  assert.ok(entry.seeded, `${entry.id} must be seeded`);
  assert.ok(entry.phrasings.length >= 3, `${entry.id}: give visitors at least 3 phrasings`);
  for (const p of entry.phrasings) {
    assert.equal(p, normalizeQuestion(p), `${entry.id}: phrasing not normalized: "${p}"`);
  }
  assert.ok(entry.answer.length > 0 && entry.answer.length <= 600, `${entry.id}: answer length`);
  const headline = entry.answer.split('\n')[0];
  assert.ok(headline.trim().split(/\s+/).length <= 10, `${entry.id}: headline too long`);
  assert.ok(entry.recap.length > 0 && entry.recap.length <= 150, `${entry.id}: recap length`);
}

console.log('check-seeds: ok');
```

Run it (fails until seeds are right), fix seeds until green.

- [ ] **Step 4: Write `scripts/seed-ask-cache.ts`:**

```ts
/**
 * Check-first cache migration: adds any SEED_ENTRIES whose id is not already
 * in the index; never overwrites an existing entry, so re-running is safe and
 * grown/edited entries survive. `--dry` prints the would-be adds and exits.
 *
 *   BLOB_READ_WRITE_TOKEN=... npm run seed:ask
 *   npm run seed:ask -- --dry
 */
import { head, put } from '@vercel/blob';
import { CACHE_PATHNAME, isCacheEntry, type CacheEntry } from '../src/app/_ai/cache';
import { SEED_ENTRIES } from '../src/app/_ai/seeds';

const dry = process.argv.includes('--dry');

async function readIndex(): Promise<CacheEntry[]> {
  try {
    const meta = await head(CACHE_PATHNAME);
    const response = await fetch(meta.downloadUrl);
    const parsed = (await response.json()) as { entries?: unknown[] };
    return Array.isArray(parsed?.entries) ? parsed.entries.filter(isCacheEntry) : [];
  } catch {
    return []; // first run: no index yet
  }
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !dry) {
    console.error('seed-ask-cache: BLOB_READ_WRITE_TOKEN is not set (use --dry to preview)');
    process.exit(1);
  }

  const existing = dry && !process.env.BLOB_READ_WRITE_TOKEN ? [] : await readIndex();
  const have = new Set(existing.map((e) => e.id));
  const missing = SEED_ENTRIES.filter((e) => !have.has(e.id)).map((e) => ({
    ...e,
    updatedAt: Date.now(),
  }));

  console.log(`index has ${existing.length} entries; ${missing.length} seeds to add:`);
  for (const entry of missing) console.log(`  + ${entry.id}`);
  if (dry || missing.length === 0) return;

  await put(CACHE_PATHNAME, JSON.stringify({ version: 1, entries: [...existing, ...missing] }), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
    allowOverwrite: true,
  });
  console.log('seed-ask-cache: written');
}

void main();
```

- [ ] **Step 5: package.json** — add `"seed:ask": "tsx scripts/seed-ask-cache.ts"` to scripts and append ` && tsx scripts/check-seeds.ts` to `check`. Run `npm run check` and `npm run seed:ask -- --dry` (prints the 20 adds without writing).
- [ ] **Step 6: Commit** — `git add src/app/_ai/cacheStore.ts src/app/_ai/seeds.ts scripts/check-seeds.ts scripts/seed-ask-cache.ts package.json && git commit -m "feat: cache store, recruiter seeds, seed migration"`

---

### Task 6: Route integration — cache-first serving + write-back

**Files:** Modify `src/app/api/chat/route.ts`.

**Interfaces consumed:** `matchCache` (T1); `loadCacheEntries`, `serveHitEffects`, `writeBackAnswer`, `canWriteBack` (T5); `contact-form` command (T3); `ASK.formTitle` (T4).

- [ ] **Step 1: Extend `actionFor` and add the cache action mapper.** `actionFor` becomes surface-aware; import `ASK` alongside `CHAT`, and `PromptSurface` is already imported:

```ts
function actionFor(commands: SentinelCommand[], surface: PromptSurface): ChatAction | null {
  const command = commands.find(
    (c) => c.kind === 'resume' || c.kind === 'contact' || (surface === 'ask' && c.kind === 'contact-form'),
  );
  if (!command) return null;
  if (command.kind === 'resume') return { label: CHAT.resumeLabel, opens: 'resume' };
  if (command.kind === 'contact-form') return { label: ASK.formTitle, form: { draft: command.draft } };
  if (command.kind === 'contact') return { label: CHAT.sendLabel, sends: command.draft };
  return null;
}

/** Cache entries carry action by name; labels still come from PORTFOLIO. */
function cacheAction(entry: CacheEntry): ChatAction | null {
  if (entry.action === 'resume') return { label: CHAT.resumeLabel, opens: 'resume' };
  if (entry.action === 'contact-form') return { label: ASK.formTitle, form: { draft: '' } };
  return null;
}
```

Update the existing `actionFor(commands)` call site to pass `surface`.

- [ ] **Step 2: Serve cache hits.** In `POST`, after `question` is computed and the empty-question fallback returns, BEFORE the rate limiter (a cache hit costs no model call, so a rate-limited visitor still gets instant seeded answers):

```ts
  if (surface === 'ask') {
    const hit = matchCache(await loadCacheEntries(), question);
    if (hit) {
      // The invocation must outlive the response for the hit bookkeeping and
      // transcript write — same after() reasoning as the model path.
      try {
        after(() => {
          serveHitEffects(hit);
          logAskTurn(sessionId, question, hit.answer);
        });
      } catch {
        serveHitEffects(hit);
        logAskTurn(sessionId, question, hit.answer);
      }
      return ndjson([
        { type: 'format', format: hit.format },
        { type: 'token', text: hit.answer },
        { type: 'done', fallback: false, action: cacheAction(hit), recap: hit.recap },
      ]);
    }
  }
```

- [ ] **Step 3: Write back clean first-turn answers.** `modelResponse` needs the prior-turn count: compute `const priorFireflyTurns = history.filter((m) => m.role === 'firefly').length;` in `POST` and pass it through to `modelResponse`. In the success branch (where `done` is written and `logAskTurn` is scheduled), extend the ask-surface `after()` callback:

```ts
          if (surface === 'ask') {
            const recap = recapOf(commands);
            const writable = canWriteBack({ question, priorFireflyTurns, answer: full, action });
            try {
              after(() => {
                logAskTurn(sessionId, question, full);
                if (writable && format) void writeBackAnswer(question, format, full, recap);
              });
            } catch {
              logAskTurn(sessionId, question, full);
              if (writable && format) void writeBackAnswer(question, format, full, recap);
            }
          }
```

(This replaces the existing ask-surface `after(() => logAskTurn(...))` block — one `after()`, both effects.)

- [ ] **Step 4: Verify.** `npm run check`, `npm run build`, `npm run lint` — clean. Then dev-server smoke (`npm run dev`, note the port):
  - Chat surface curl (no `surface`) → byte-identical event shapes to before (no `format`, no `recap`).
  - Ask-surface curl with a seeded question is expected to MISS locally when `BLOB_READ_WRITE_TOKEN` is unset (cache silently off) and stream from the AI — confirm that. If the token IS set in `.env.local` and the index has been seeded, the same curl must return instantly with `format`/`token`/`done` in one flush.
  - Kill the dev server.
- [ ] **Step 5: Commit** — `git add src/app/api/chat/route.ts && git commit -m "feat: cache-first ask answers with write-back"`

---

### Task 7: SlideRail, ProjectsSlide rework, RailSlide, page switch

**Files:** Create `src/app/ask/_components/SlideRail.tsx`, `src/app/ask/_components/RailSlide.tsx`; modify `src/app/ask/_components/ProjectsSlide.tsx`, `src/app/ask/page.tsx`.

**Interfaces produced:**
- `SlideRail({ cards, ariaLabel }: { cards: RailCardItem[]; ariaLabel: string })` with `interface RailCardItem { key: string; title?: string; body: string; image?: string; href?: string; pills?: string[] }`
- `RailSlide({ question, text }: { question: string; text: string })`
- `ProjectsSlide` keeps its `({ question, text })` signature.

- [ ] **Step 1: `SlideRail.tsx`:**

```tsx
'use client';

import { useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useReducedMotion } from 'motion/react';

export interface RailCardItem {
  key: string;
  title?: string;
  body: string;
  image?: string;
  href?: string;
  pills?: string[];
}

/**
 * The slide-native horizontal rail: snap-scrolling cards, ~2.5 visible with
 * the next peeking in as the scroll cue. Sideways only — the page's vertical
 * lock is untouched. ‹ › and arrow keys nudge card-by-card; native
 * trackpad/touch scrolling works as-is.
 */
export default function SlideRail({ cards, ariaLabel }: { cards: RailCardItem[]; ariaLabel: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const nudge = useCallback(
    (direction: 1 | -1) => {
      const rail = railRef.current;
      if (!rail) return;
      const card = rail.querySelector<HTMLElement>('[data-rail-card]');
      const step = card ? card.offsetWidth + 16 : rail.clientWidth / 2;
      rail.scrollBy({ left: direction * step, behavior: reduceMotion ? 'auto' : 'smooth' });
    },
    [reduceMotion],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Arrows must not steal the caret from the always-present ask input.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowLeft') nudge(-1);
      if (event.key === 'ArrowRight') nudge(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nudge]);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => nudge(-1)}
        className="shrink-0 text-lg text-gray-400 transition-colors hover:text-teal-300"
      >
        ‹
      </button>
      <div
        ref={railRef}
        aria-label={ariaLabel}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden pb-2 [scrollbar-width:thin]"
      >
        {cards.map((card) => (
          <div
            key={card.key}
            data-rail-card
            className="w-64 shrink-0 snap-start rounded-lg bg-slate-800 p-4 md:w-72"
          >
            {card.image && (
              <div className="relative mb-3 h-28 w-full overflow-hidden rounded bg-slate-700">
                <Image src={card.image} alt={card.title ?? ''} fill className="object-cover" sizes="18rem" />
              </div>
            )}
            {card.title &&
              (card.href ? (
                <a
                  href={card.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-base font-bold text-white transition-colors hover:text-teal-300"
                >
                  {card.title} ↗
                </a>
              ) : (
                <p className="text-base font-bold text-white">{card.title}</p>
              ))}
            <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-gray-400">{card.body}</p>
            {card.pills && card.pills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {card.pills.map((pill) => (
                  <span key={pill} className="rounded-full bg-teal-400/10 px-2.5 py-0.5 text-xs text-teal-300">
                    {pill}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => nudge(1)}
        className="shrink-0 text-lg text-gray-400 transition-colors hover:text-teal-300"
      >
        ›
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Rework `ProjectsSlide.tsx`** — same props, kicker + headline kept, the dot-stepping deck replaced by the rail:

```tsx
'use client';

import { motion, useReducedMotion } from 'motion/react';
import { parseSlideBody } from '@/app/_ai/slides';
import { ASK, PROJECTS } from '@/app/PORTFOLIO';
import SlideRail from './SlideRail';

/** The projects takeover: the main page's rail idea at slide scale. */
export default function ProjectsSlide({ question, text }: { question: string; text: string }) {
  const reduceMotion = useReducedMotion();
  const { headline } = parseSlideBody(text);

  return (
    <div className="flex h-full flex-col justify-center gap-4 px-8 md:px-24">
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xs uppercase tracking-[0.2em] text-teal-300"
      >
        {ASK.kickerPrefix} · {question}
      </motion.p>
      {headline && (
        <h2 className="max-w-4xl text-2xl font-bold leading-tight text-white md:text-4xl">{headline}</h2>
      )}
      <SlideRail
        ariaLabel={ASK.slideLabel}
        cards={PROJECTS.map((project) => ({
          key: project.id,
          title: project.title,
          body: project.description,
          image: project.image,
          href: project.github,
          pills: project.stacks,
        }))}
      />
    </div>
  );
}
```

(The old deck/dot/keyboard code in this file is removed entirely — the rail owns navigation now.)

- [ ] **Step 3: `RailSlide.tsx`:**

```tsx
'use client';

import { motion, useReducedMotion } from 'motion/react';
import { parseRailCards } from '@/app/_ai/slides';
import type { ChatAction } from '@/app/_ai/types';
import { ASK } from '@/app/PORTFOLIO';
import EditorialSlide from './EditorialSlide';
import SlideAction from './SlideAction';
import SlideRail from './SlideRail';

/**
 * The model's rail format: "- Title | detail" lines become image-less cards.
 * A reply that never card-shapes falls back to the Editorial rendering of the
 * full text — same safe failure as every other malformed shape.
 */
export default function RailSlide({
  question,
  text,
  action,
}: {
  question: string;
  text: string;
  action?: ChatAction;
}) {
  const reduceMotion = useReducedMotion();
  const { headline, cards } = parseRailCards(text);

  if (cards.length === 0) return <EditorialSlide question={question} text={text} action={action} />;

  return (
    <div className="flex h-full flex-col justify-center gap-4 px-8 md:px-24">
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xs uppercase tracking-[0.2em] text-teal-300"
      >
        {ASK.kickerPrefix} · {question}
      </motion.p>
      {headline && (
        <h2 className="max-w-4xl text-2xl font-bold leading-tight text-white md:text-4xl">{headline}</h2>
      )}
      <SlideRail
        ariaLabel={ASK.slideLabel}
        cards={cards.map((card, index) => ({
          // Streamed cards append-only; index keys keep the growing last card stable.
          key: String(index),
          title: card.title || undefined,
          body: card.body,
        }))}
      />
      <SlideAction action={action} />
    </div>
  );
}
```

- [ ] **Step 4: `page.tsx` slide switch** — add the rail branch before the list branch:

```tsx
                  ) : current.format === 'rail' ? (
                    <RailSlide question={current.question} text={current.text} action={current.action} />
```

with the import `import RailSlide from './_components/RailSlide';`.

- [ ] **Step 5: Verify** — `npm run build` + `npm run lint` clean.
- [ ] **Step 6: Commit** — `git add src/app/ask/_components/SlideRail.tsx src/app/ask/_components/RailSlide.tsx src/app/ask/_components/ProjectsSlide.tsx src/app/ask/page.tsx && git commit -m "feat: snap-scrolling rail — projects rework and rail format"`

---

### Task 8: ContactFormCard + SlideAction wiring

**Files:** Create `src/app/ask/_components/ContactFormCard.tsx`; modify `src/app/ask/_components/SlideAction.tsx`.

- [ ] **Step 1: `ContactFormCard.tsx`:**

```tsx
'use client';

import { FormEvent, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ASK, CHAT, PORTFOLIO } from '@/app/PORTFOLIO';
import {
  MAX_CONTACT_MESSAGE_CHARS,
  MAX_CONTACT_NAME_CHARS,
  validateDraft,
} from '@/app/_contact/draft';

type FormState = 'editing' | 'confirming' | 'sending' | 'sent' | 'failed';

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-teal-300/50';

/**
 * The /ask contact flow: the form owns collecting name and email — the model
 * only ever drafts the message. Sending takes an explicit confirm, and every
 * failure degrades to the mailto the site already offers.
 */
export default function ContactFormCard({ draft }: { draft: string }) {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<FormState>('editing');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(draft);

  const valid = validateDraft({ name, email, message });

  const toConfirm = (event: FormEvent) => {
    event.preventDefault();
    if (valid) setState('confirming');
  };

  const send = async () => {
    setState('sending');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      const body = (await response.json()) as { ok?: boolean };
      setState(body.ok ? 'sent' : 'failed');
    } catch (err) {
      console.error('ContactFormCard: send failed', err);
      setState('failed');
    }
  };

  if (state === 'sent') {
    return <p className="mt-3 text-sm text-teal-300">{CHAT.sentLabel}</p>;
  }

  if (state === 'failed') {
    return (
      <a href={`mailto:${PORTFOLIO.email}`} className="mt-3 inline-block text-sm text-teal-300 hover:underline">
        {CHAT.sendFailedLabel} →
      </a>
    );
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 w-full max-w-md rounded-xl bg-slate-800/80 p-4"
    >
      <p className="text-sm font-bold text-white">{ASK.formTitle}</p>
      <AnimatePresence mode="wait" initial={false}>
        {state === 'editing' ? (
          <motion.form
            key="editing"
            exit={reduceMotion ? undefined : { opacity: 0 }}
            onSubmit={toConfirm}
            className="mt-3 flex flex-col gap-2.5"
          >
            <input
              value={name}
              maxLength={MAX_CONTACT_NAME_CHARS}
              onChange={(e) => setName(e.target.value)}
              placeholder={ASK.nameLabel}
              aria-label={ASK.nameLabel}
              className={inputClass}
            />
            <input
              value={email}
              type="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder={ASK.emailLabel}
              aria-label={ASK.emailLabel}
              className={inputClass}
            />
            <textarea
              value={message}
              maxLength={MAX_CONTACT_MESSAGE_CHARS}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={ASK.messagePrompt}
              aria-label={ASK.messageLabel}
              rows={3}
              className={`${inputClass} resize-none`}
            />
            <button
              type="submit"
              disabled={!valid}
              className="self-end rounded-full bg-teal-400/10 px-5 py-1.5 text-sm text-teal-300 transition-opacity disabled:opacity-30"
            >
              {CHAT.sendLabel}
            </button>
          </motion.form>
        ) : (
          <motion.div
            key="confirming"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 flex flex-col gap-3"
          >
            <p className="text-sm text-gray-300">{ASK.confirmTitle}</p>
            <p className="rounded-lg bg-slate-900/60 p-3 text-sm leading-relaxed text-gray-300">{message}</p>
            <p className="text-xs text-gray-500">
              {name} · {email}
            </p>
            <div className="flex gap-3 self-end">
              <button
                type="button"
                onClick={() => setState('editing')}
                disabled={state === 'sending'}
                className="text-sm text-gray-400 transition-colors hover:text-teal-300 disabled:opacity-50"
              >
                {ASK.editLabel}
              </button>
              <button
                type="button"
                onClick={send}
                disabled={state === 'sending'}
                className="rounded-full bg-teal-400/10 px-5 py-1.5 text-sm text-teal-300 disabled:opacity-50"
              >
                {state === 'sending' ? CHAT.sendingLabel : ASK.confirmLabel}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

- [ ] **Step 2: Wire into `SlideAction.tsx`** — before the existing branches:

```tsx
  if (action.form) return <ContactFormCard draft={action.form.draft} />;
```

with `import ContactFormCard from './ContactFormCard';`. (Order matters: `form` first, then `sends`, `opens`, `href`.)

- [ ] **Step 3: Verify** — `npm run build` + `npm run lint`.
- [ ] **Step 4: Commit** — `git add src/app/ask/_components/ContactFormCard.tsx src/app/ask/_components/SlideAction.tsx && git commit -m "feat: two-input contact form with confirm step"`

---

### Task 9: Integration verification + docs

**Files:** Modify `CLAUDE.md` (short additions).

- [ ] **Step 1: CLAUDE.md** — in the existing "The /ask route" section, add 2–3 sentences: the blob answer cache (`src/app/_ai/cache.ts`/`cacheStore.ts`, seeds via `npm run seed:ask`, cache-first before the AI, context-free write-back); the `rail` format + `SlideRail`; the contact form replacing conversational collection on /ask only.
- [ ] **Step 2: Full suites** — `npm run check` (all scripts incl. cache/seeds), `npm run build`, `npm run lint`.
- [ ] **Step 3: Seeding** — if `BLOB_READ_WRITE_TOKEN` is present in `.env.local`: `npm run seed:ask` (real write), then re-run to confirm "0 seeds to add" (check-first proof). Otherwise `npm run seed:ask -- --dry` and note the token step for deployment.
- [ ] **Step 4: Dev-server smoke** — with the server up: seeded-question curl behaves per token presence (Task 6 Step 4 expectations); chat-surface curl unchanged.
- [ ] **Step 5: Commit** — `git add CLAUDE.md && git commit -m "docs: cache, rail, and contact form notes"`

(The controller runs the browser walkthrough per the spec's Verification section after this task.)
