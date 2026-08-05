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
