import { validateDraft, type ContactDraft } from '../_contact/draft';

/**
 * The model signals an action by ending its reply with a sentinel line. This
 * module is the only thing that trusts the model's *shape*; nothing here trusts
 * its *content*. Every malformed case returns `command: null`, which the route
 * renders as an ordinary reply with no button — the safe failure.
 */

const CONTACT = '[[CONTACT';
const RESUME = '[[RESUME';
const COMMANDS = [CONTACT, RESUME];
const LONGEST_COMMAND = Math.max(...COMMANDS.map((command) => command.length));

export type SentinelCommand =
  | { kind: 'contact'; draft: ContactDraft }
  | { kind: 'resume' };

export interface SentinelSplit {
  /** The reply as the visitor should see it, with any sentinel removed. */
  visible: string;
  command: SentinelCommand | null;
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
  const start = commandStart(text);
  if (start !== -1) return text.length - start;

  // Trailing whitespace is held rather than released: the sentinel sits on its
  // own line, so the newline in front of it would otherwise be streamed out and
  // leave a dangling blank line under the reply. If no sentinel follows, this
  // whitespace is released with the next chunk, or trimmed at the end.
  const trimmed = text.trimEnd();
  if (trimmed.length < text.length) return text.length - trimmed.length;

  // Otherwise hold the longest tail that is still a viable prefix of a command.
  const maxHold = Math.min(LONGEST_COMMAND - 1, text.length);
  for (let hold = maxHold; hold > 0; hold--) {
    const tail = text.slice(text.length - hold);
    if (COMMANDS.some((command) => command.startsWith(tail))) return hold;
  }
  return 0;
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

/**
 * Split a finished reply into what the visitor sees and what the UI should do.
 * The first sentinel wins; if it is malformed the whole reply yields no action,
 * rather than searching on for a later one that might parse.
 */
export function splitSentinel(text: string): SentinelSplit {
  const start = commandStart(text);
  if (start === -1) return { visible: text, command: null };

  const visible = text.slice(0, start).trimEnd();
  const rest = text.slice(start);

  const close = rest.indexOf(']]');
  if (close === -1) return { visible, command: null };

  // Strip the leading '[[' and the trailing ']]'.
  const body = rest.slice(2, close).trim();

  if (body === 'RESUME') return { visible, command: { kind: 'resume' } };

  if (body.startsWith('CONTACT')) {
    const draft = parseContact(body.slice('CONTACT'.length));
    return { visible, command: draft ? { kind: 'contact', draft } : null };
  }

  return { visible, command: null };
}
