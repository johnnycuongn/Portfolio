/**
 * Seeds the five competencies — the fixed spine every milestone and win tags.
 *
 * Idempotent: it reads the existing ids first and only inserts what is missing, so
 * running it against a live database is safe. It never updates or deletes an
 * existing row; the ids are a permanent part of the data contract, and renaming a
 * competency is a deliberate act, not a side effect of a deploy.
 *
 *   npm run seed:career
 */

import { inArray } from 'drizzle-orm';
import { getDb } from '../src/lib/db';
import { competencies } from '../src/lib/db/schema';
import { COMPETENCY_SEED } from '../src/lib/career/types';

async function main() {
  const db = getDb();

  const existing = await db
    .select({ id: competencies.id })
    .from(competencies)
    .where(
      inArray(
        competencies.id,
        COMPETENCY_SEED.map((c) => c.id),
      ),
    );

  const present = new Set(existing.map((row) => row.id));
  const missing = COMPETENCY_SEED.filter((c) => !present.has(c.id));

  if (missing.length === 0) {
    console.log(`seed-career: all ${COMPETENCY_SEED.length} competencies already present`);
    return;
  }

  await db.insert(competencies).values(
    missing.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder })),
  );

  for (const c of missing) console.log(`seed-career: inserted ${c.id} (${c.name})`);
  console.log(`seed-career: ${missing.length} inserted, ${present.size} already present`);
}

main().catch((error) => {
  console.error('seed-career: failed');
  console.error(error);
  process.exit(1);
});
