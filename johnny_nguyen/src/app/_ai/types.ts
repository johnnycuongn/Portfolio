import type { ContactDraft } from '../_contact/draft';

/** Per-message character cap, enforced identically on client and server so they cannot drift. */
export const MAX_MESSAGE_CHARS = 500;
/** How many trailing messages of history are kept/sent, enforced identically on client and server. */
export const MAX_HISTORY = 12;

export type ChatRole = 'user' | 'firefly';

export interface ChatAction {
  label: string;
  /** External destination. Mutually exclusive with `opens` and `sends`. */
  href?: string;
  /** In-page target this button opens instead of navigating anywhere. */
  opens?: 'resume';
  /** A message Firefly has drafted. The button posts it; the model never sends. */
  sends?: ContactDraft;
  /** The /ask contact form, with whatever message the model already drafted. */
  form?: { draft: string };
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** Optional link rendered under the message, e.g. the resume. */
  action?: ChatAction;
  /** True when this answer came from the canned fallback rather than the model. */
  fallback?: boolean;
}
