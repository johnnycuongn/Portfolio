import { validateDraft, type ContactDraft } from '../_contact/draft';

/**
 * The model signals an action by ending its reply with a sentinel line. This
 * module is the only thing that trusts the model's *shape*; nothing here trusts
 * its *content*. Every malformed case returns `command: null`, which the route
 * renders as an ordinary reply with no button — the safe failure.
 */

const CONTACT = '[[CONTACT';
const RESUME = '[[RESUME';
const RECAP = '[[RECAP';
const COMMANDS = [CONTACT, RESUME, RECAP];
const LONGEST_COMMAND = Math.max(...COMMANDS.map((command) => command.length));

const MAX_RECAP_CHARS = 300;

export type SentinelCommand =
  | { kind: 'contact'; draft: ContactDraft }
  | { kind: 'resume' }
  | { kind: 'recap'; text: string };

export interface SentinelSplit {
  /** The reply as the visitor should see it, with any sentinel removed. */
  visible: string;
  command: SentinelCommand | null;
}

export interface ReplySplit {
  visible: string;
  commands: SentinelCommand[];
}

/** Index of the first known command marker, or -1. */
function commandStart(text: string): number {
  let earliest = -1;
  for (const command of COMMANDS) {
    const index = text.indexOf(command);
    if (index !== -1 && (earliest === -1 || index < earliest)) earliest = index;
  }
  return earliest;
}

/**
 * How many trailing characters must NOT be streamed to the client yet, because
 * they either are a sentinel or could still become one as more tokens arrive.
 * Called once per chunk; everything before the held tail is safe to release and
 * can never retroactively become part of a sentinel.
 */
export function heldPrefixLength(text: string): number {
  const holdFrom = holdStart(text);
  if (holdFrom === -1) return 0;

  // Extend the hold back over any whitespace immediately in front. The sentinel
  // sits on its own line, and that newline is its framing rather than part of
  // the reply. A streamed token cannot be taken back, so the whitespace must
  // never be released *before* we know whether a sentinel follows it — if none
  // does, it is released intact with the next chunk.
  const before = text.slice(0, holdFrom).replace(/\s+$/, '');
  return text.length - before.length;
}

/**
 * Index from which `text` must be withheld, ignoring the whitespace handling
 * above, or -1 if all of it is safe to release.
 */
function holdStart(text: string): number {
  const start = commandStart(text);
  if (start !== -1) return start;

  // A trailing tail that is still a viable prefix of a command.
  const maxHold = Math.min(LONGEST_COMMAND - 1, text.length);
  for (let hold = maxHold; hold > 0; hold--) {
    const tail = text.slice(text.length - hold);
    if (COMMANDS.some((command) => command.startsWith(tail))) return text.length - hold;
  }

  // Trailing whitespace on its own: it may yet turn out to front a sentinel.
  const trimmed = text.trimEnd();
  if (trimmed.length < text.length) return trimmed.length;

  return -1;
}

function parseContact(body: string): ContactDraft | null {
  const parts = body.split('|');
  if (parts.length < 3) return null;

  const draft: ContactDraft = {
    name: parts[0].trim(),
    email: parts[1].trim(),
    // Everything after the second separator is the message — a '|' the visitor
    // typed must not silently truncate what Johnny receives.
    message: parts.slice(2).join('|').trim(),
  };

  return validateDraft(draft) ? draft : null;
}

function parseCommand(body: string): SentinelCommand | null {
  if (body === 'RESUME') return { kind: 'resume' };

  if (body.startsWith('RECAP')) {
    const text = body.slice('RECAP'.length).trim();
    if (!text || text.length > MAX_RECAP_CHARS) return null;
    return { kind: 'recap', text };
  }

  if (body.startsWith('CONTACT')) {
    const draft = parseContact(body.slice('CONTACT'.length));
    return draft ? { kind: 'contact', draft } : null;
  }

  return null;
}

/**
 * Split a finished reply into visible text and every trailing sentinel. The
 * visible text still ends at the FIRST marker — nothing after a sentinel is
 * ever shown — but unlike the original single-command split, parsing walks on
 * so a reply can carry both a recap and an action. A malformed member is
 * skipped rather than aborting the walk: the recap failing must not cost the
 * visitor their resume button, and vice versa.
 */
export function splitReply(text: string): ReplySplit {
  const start = commandStart(text);
  if (start === -1) return { visible: text, commands: [] };

  const visible = text.slice(0, start).trimEnd();
  const commands: SentinelCommand[] = [];
  let rest = text.slice(start);

  while (rest) {
    const close = rest.indexOf(']]');
    if (close === -1) break;
    const command = parseCommand(rest.slice(2, close).trim());
    if (command) commands.push(command);

    const next = commandStart(rest.slice(close + 2));
    if (next === -1) break;
    rest = rest.slice(close + 2 + next);
  }

  return { visible, commands };
}

/**
 * The original single-command view, kept for callers that predate recaps:
 * the first NON-recap command wins, recaps are invisible to it. If the first
 * non-recap sentinel is malformed, it suppresses the entire action to preserve
 * the old "first wins" contract.
 */
export function splitSentinel(text: string): SentinelSplit {
  const start = commandStart(text);
  if (start === -1) return { visible: text, command: null };

  const visible = text.slice(0, start).trimEnd();
  let rest = text.slice(start);

  // Walk through sentinels until we find a non-recap one
  while (rest) {
    const close = rest.indexOf(']]');
    if (close === -1) break;

    const body = rest.slice(2, close).trim();
    const command = parseCommand(body);

    if (command && command.kind !== 'recap') {
      return { visible, command };
    }

    if (command === null) {
      // Malformed sentinel: check if it's a recap or something else
      if (!body.startsWith('RECAP')) {
        // Malformed non-recap suppresses the whole action (old behavior)
        return { visible, command: null };
      }
      // Malformed recap: skip it and continue
    } else if (command.kind === 'recap') {
      // Valid recap: skip it and continue
    }

    // Move to the next sentinel
    const next = commandStart(rest.slice(close + 2));
    if (next === -1) break;
    rest = rest.slice(close + 2 + next);
  }

  return { visible, command: null };
}
