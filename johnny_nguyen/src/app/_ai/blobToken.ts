/**
 * Where the Vercel Blob credential comes from.
 *
 * Vercel names a store's variables after a prefix you choose when the store is
 * created, so this project's is BLOB_MESSAGE_READ_WRITE_TOKEN rather than the
 * SDK's default BLOB_READ_WRITE_TOKEN. That default is what `@vercel/blob`
 * reads when no token is passed, so every call here passes one explicitly —
 * otherwise the SDK looks up a variable that does not exist and every write
 * fails as "no token", silently.
 *
 * The default name is still honoured as a fallback: a preview deployment or a
 * second store connected without a custom prefix keeps working, and so does
 * anyone who pulls the plain variable locally.
 */
export function blobToken(): string | undefined {
  // A declared-but-empty variable is how a half-finished env setup looks, and
  // it must read as "absent" rather than be handed to the SDK as a token.
  const token = process.env.BLOB_MESSAGE_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  return token || undefined;
}

/** The names checked, in order — for error messages that can actually be acted on. */
export const BLOB_TOKEN_NAMES = 'BLOB_MESSAGE_READ_WRITE_TOKEN or BLOB_READ_WRITE_TOKEN';
