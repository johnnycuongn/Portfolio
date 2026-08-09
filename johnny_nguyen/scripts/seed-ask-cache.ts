/**
 * Check-first cache migration: adds any SEED_ENTRIES whose id is not already
 * in the index; never overwrites an existing entry, so re-running is safe and
 * grown/edited entries survive. `--dry` prints the would-be adds and exits.
 *
 *   vercel env pull && npm run seed:ask
 *   npm run seed:ask -- --dry
 */
import { head, put } from '@vercel/blob';
import { BLOB_TOKEN_NAMES, blobToken } from '../src/app/_ai/blobToken';
import { CACHE_PATHNAME, isCacheEntry, type CacheEntry } from '../src/app/_ai/cache';
import { SEED_ENTRIES } from '../src/app/_ai/seeds';

const dry = process.argv.includes('--dry');

async function readIndex(): Promise<CacheEntry[]> {
  try {
    const meta = await head(CACHE_PATHNAME, { token: blobToken() });
    const response = await fetch(meta.downloadUrl);
    const parsed = (await response.json()) as { entries?: unknown[] };
    return Array.isArray(parsed?.entries) ? parsed.entries.filter(isCacheEntry) : [];
  } catch {
    return []; // first run: no index yet
  }
}

async function main() {
  if (!blobToken() && !dry) {
    console.error(`seed-ask-cache: no blob token (set ${BLOB_TOKEN_NAMES}, or use --dry to preview)`);
    process.exit(1);
  }

  const existing = dry && !blobToken() ? [] : await readIndex();
  const have = new Set(existing.map((e) => e.id));
  const missing = SEED_ENTRIES.filter((e) => !have.has(e.id)).map((e) => ({
    ...e,
    updatedAt: Date.now(),
  }));

  console.log(`index has ${existing.length} entries; ${missing.length} seeds to add:`);
  for (const entry of missing) console.log(`  + ${entry.id}`);
  if (dry || missing.length === 0) return;

  await put(CACHE_PATHNAME, JSON.stringify({ version: 1, entries: [...existing, ...missing] }), {
    token: blobToken(),
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
    allowOverwrite: true,
  });
  console.log('seed-ask-cache: written');
}

void main();
