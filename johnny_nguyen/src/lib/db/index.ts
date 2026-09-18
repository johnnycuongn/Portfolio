/**
 * The one database client. Server-only — never import this from a client component.
 *
 * Driver choice: `drizzle-orm/neon-http`, not `neon-serverless` or `node-postgres`.
 * Every page render and API route on Vercel is a short-lived serverless function,
 * and a TCP Postgres connection per invocation exhausts the connection limit long
 * before traffic does. The HTTP driver issues each query as a stateless fetch, so
 * there is no pool to exhaust and nothing to clean up. The trade-off is no
 * interactive transactions — a cost this app never pays, because nothing it does
 * needs one.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type CareerDb = NeonHttpDatabase<typeof schema>;

let cached: CareerDb | null = null;

/**
 * The client, created on first use. Throws a clear error when DATABASE_URL is
 * missing rather than failing later inside the driver with something cryptic.
 */
export function getDb(): CareerDb {
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. The career dashboard needs a Neon Postgres connection string — ' +
        'add it to .env.local for local work (Neon dashboard -> Connection Details -> pooled) ' +
        'and to the Vercel project environment for deploys.',
    );
  }

  cached = drizzle(neon(url), { schema });
  return cached;
}

/**
 * `db` is a lazy handle onto `getDb()`. It behaves exactly like the drizzle client,
 * but the DATABASE_URL check happens on first *query* rather than on import — which
 * is what keeps `next build` from failing on a page that merely imports this module
 * without ever reaching the database.
 */
export const db: CareerDb = new Proxy({} as CareerDb, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    // Bind methods to the real client: an unbound method would re-enter this proxy
    // as `this` and recurse.
    return typeof value === 'function' ? value.bind(real) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb() as object, prop);
  },
});

export * from './schema';
