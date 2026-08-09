import assert from 'node:assert/strict';
import { blobToken } from '../src/app/_ai/blobToken';

const saved = {
  prefixed: process.env.BLOB_MESSAGE_READ_WRITE_TOKEN,
  plain: process.env.BLOB_READ_WRITE_TOKEN,
};

function withEnv(prefixed: string | undefined, plain: string | undefined) {
  if (prefixed === undefined) delete process.env.BLOB_MESSAGE_READ_WRITE_TOKEN;
  else process.env.BLOB_MESSAGE_READ_WRITE_TOKEN = prefixed;
  if (plain === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = plain;
}

// This project's store uses a custom prefix, so that name wins.
withEnv('vercel_blob_rw_prefixed', undefined);
assert.equal(blobToken(), 'vercel_blob_rw_prefixed');

// The SDK's default name still works — preview deploys and plain `vercel env pull`.
withEnv(undefined, 'vercel_blob_rw_plain');
assert.equal(blobToken(), 'vercel_blob_rw_plain');

// Both present: the prefixed one is this project's store, so it takes precedence.
withEnv('vercel_blob_rw_prefixed', 'vercel_blob_rw_plain');
assert.equal(blobToken(), 'vercel_blob_rw_prefixed');

// Neither, or an empty string, means "no cache and no logging" — never a throw.
withEnv(undefined, undefined);
assert.equal(blobToken(), undefined);
withEnv('', '');
assert.equal(blobToken(), undefined, 'an empty token must not read as configured');

withEnv(saved.prefixed, saved.plain);

console.log('check-blob-token: ok');
