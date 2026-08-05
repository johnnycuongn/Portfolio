import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../src/app/_ai/knowledge';
import { PORTFOLIO, TimelineData, PROJECTS } from '../src/app/PORTFOLIO';

const prompt = buildSystemPrompt();

// Every fact on the page is available to the model.
for (const job of TimelineData) {
  assert.ok(prompt.includes(job.company), `prompt missing company "${job.company}"`);
  assert.ok(prompt.includes(job.year), `prompt missing dates for "${job.company}"`);
}
for (const project of PROJECTS) {
  assert.ok(prompt.includes(project.title), `prompt missing project "${project.title}"`);
}
assert.ok(prompt.includes(PORTFOLIO.email));
assert.ok(prompt.includes(PORTFOLIO.resume_link));

// The tone rules survived.
for (const phrase of ['Certainly', 'Great question', 'delve', 'leverage', 'passionate about']) {
  assert.ok(prompt.includes(phrase), `banned-phrase list missing "${phrase}"`);
}
assert.ok(/third person/i.test(prompt), 'prompt must forbid speaking as Johnny');
assert.ok(prompt.includes('60 words'), 'prompt must cap answer length');

// Worked examples are present — they carry the tone.
assert.ok(prompt.split('Q:').length - 1 >= 4, 'expected at least four worked examples');

// A missing or empty knowledge file must not break the build.
assert.ok(prompt.length > 500);

console.log('check-knowledge: ok');
