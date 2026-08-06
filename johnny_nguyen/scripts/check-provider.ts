import assert from 'node:assert/strict';

// Provider selection reads process.env at call time, so the env has to be set
// before the module is imported and can be changed between assertions.
const original = {
  gemini: process.env.GEMINI_AI_API_KEY,
  groq: process.env.GROQ_API_KEY,
};

async function main() {
  const { configuredProviders, isProviderConfigured } = await import('../src/app/_ai/provider');

  const set = (gemini?: string, groq?: string) => {
    if (gemini === undefined) delete process.env.GEMINI_AI_API_KEY;
    else process.env.GEMINI_AI_API_KEY = gemini;
    if (groq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groq;
  };

  // Gemini leads when both are present: it is the one with the throughput to
  // carry the site, and Groq's free tier cannot.
  set('g-key', 'q-key');
  assert.deepEqual(configuredProviders(), ['gemini', 'groq'], 'gemini must be tried first');
  assert.equal(isProviderConfigured(), true);

  // Either one alone is a working configuration — the order is a preference,
  // not a requirement that both exist.
  set('g-key', undefined);
  assert.deepEqual(configuredProviders(), ['gemini']);
  assert.equal(isProviderConfigured(), true);

  set(undefined, 'q-key');
  assert.deepEqual(configuredProviders(), ['groq'], 'groq alone must still serve');
  assert.equal(isProviderConfigured(), true);

  // No key at all is not an error: the route checks this and serves the canned
  // fallback rather than attempting a call it knows will fail.
  set(undefined, undefined);
  assert.deepEqual(configuredProviders(), []);
  assert.equal(isProviderConfigured(), false);

  // An empty string is not a key. Vercel hands unset variables through as '',
  // so treating that as configured would send every visitor's question to an
  // endpoint with no credential and turn a clean fallback into a 401.
  set('', '');
  assert.deepEqual(configuredProviders(), [], 'empty strings must not count as configured');
  assert.equal(isProviderConfigured(), false);

  // Restore, so this script leaves the environment as it found it.
  set(original.gemini, original.groq);

  console.log('check-provider: ok');
}

void main();
