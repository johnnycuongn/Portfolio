/** Per-message character cap, enforced identically on client and server so they cannot drift. */
export const MAX_MESSAGE_CHARS = 500;
/** How many trailing messages of history are kept/sent, enforced identically on client and server. */
export const MAX_HISTORY = 8;

export type ChatRole = 'user' | 'firefly';

export interface ChatAction {
  label: string;
  href: string;
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
