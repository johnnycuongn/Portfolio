import { defineConfig } from 'drizzle-kit';

/**
 * `npm run db:generate` writes SQL into drizzle/ and needs no database.
 * `npm run db:push` / `db:migrate` do, and read DATABASE_URL from the environment.
 */
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
