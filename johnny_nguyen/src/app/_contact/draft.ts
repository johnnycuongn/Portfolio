/** Field caps for a message passed to Johnny through the chat. Enforced on the
 *  parsed sentinel and again in the API route, so a direct POST cannot bypass
 *  them. Distinct from `_ai/types.ts`'s MAX_MESSAGE_CHARS, which caps what a
 *  visitor may type into the chat input — a different limit on a different thing. */
export const MAX_CONTACT_NAME_CHARS = 80;
export const MAX_CONTACT_EMAIL_CHARS = 254;
export const MAX_CONTACT_MESSAGE_CHARS = 1000;

export interface ContactDraft {
  name: string;
  email: string;
  message: string;
}

/** Deliberately loose: this exists to catch a model hallucinating a malformed
 *  address or a bot posting junk, not to decide whether an address is real.
 *  Delivery is the only true test, and a wrong-but-well-formed address costs
 *  nothing here. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDraft(draft: ContactDraft): boolean {
  const name = draft.name?.trim() ?? '';
  const email = draft.email?.trim() ?? '';
  const message = draft.message?.trim() ?? '';

  return (
    name.length > 0 &&
    name.length <= MAX_CONTACT_NAME_CHARS &&
    email.length >= 3 &&
    email.length <= MAX_CONTACT_EMAIL_CHARS &&
    EMAIL_SHAPE.test(email) &&
    message.length > 0 &&
    message.length <= MAX_CONTACT_MESSAGE_CHARS
  );
}
