import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSystemPrompt, composeSystemPrompt, extractKnowledgeProse } from '../src/app/_ai/knowledge';
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

// The tone rules survived. All ten banned phrases must appear verbatim —
// this is the full mandated list, not a sample of it.
for (const phrase of [
  'Certainly',
  'Great question',
  "I'd be happy to",
  "It's important to note",
  'delve',
  'leverage',
  'robust',
  'passionate about',
  'emoji',
  'Hope that helps!',
]) {
  assert.ok(prompt.includes(phrase), `banned-phrase list missing "${phrase}"`);
}
assert.ok(/third person/i.test(prompt), 'prompt must forbid speaking as Johnny');
assert.ok(prompt.includes('60 words'), 'prompt must cap answer length');

// Worked examples are present — they carry the tone.
assert.ok(prompt.split('Q:').length - 1 >= 4, 'expected at least four worked examples');

// A missing or empty knowledge file must not break the build.
assert.ok(prompt.length > 500);

// A headings-only knowledge file (an unfilled scaffold) must not inject an
// empty "More about Johnny" section — pure token noise with nothing to say.
assert.equal(
  extractKnowledgeProse('# About Johnny\n\n## The short version\n\n## Career story\n'),
  '',
  'headings-only content should be treated as empty',
);
assert.equal(extractKnowledgeProse(''), '', 'empty content should be treated as empty');
assert.equal(
  extractKnowledgeProse('   \n\n   '),
  '',
  'whitespace-only content should be treated as empty',
);

// A file with real prose must still come through in full, headings and all.
const proseInput = '# About Johnny\n\nHe grew up building things and never really stopped.\n';
const proseResult = extractKnowledgeProse(proseInput);
assert.ok(
  proseResult.includes('He grew up building things and never really stopped.'),
  'prose-bearing content should be preserved',
);
assert.ok(proseResult.includes('# About Johnny'), 'headings should survive alongside prose');

// End-to-end prose path: exercise the composition logic directly (never
// touching about-johnny.md on disk) and confirm the extracted prose actually
// lands in the assembled prompt, section header and all.
const composedWithProse = composeSystemPrompt(proseResult);
assert.ok(
  composedWithProse.includes('More about Johnny'),
  'prose-bearing content should add the "More about Johnny" section',
);
assert.ok(
  composedWithProse.includes('He grew up building things and never really stopped.'),
  'prose-bearing content should appear verbatim in the composed prompt',
);

// A headings-only knowledge file composes with no section at all.
const composedWithoutProse = composeSystemPrompt('');
assert.ok(
  !composedWithoutProse.includes('More about Johnny'),
  'empty about-section should not add the "More about Johnny" section',
);

// Correspondence check against the real file on disk, rather than a constant
// that only happens to hold while the file is headings-only scaffold: the
// "More about Johnny" section must appear in the real prompt if and only if
// the real file actually has prose. This passes today (headings-only) and
// will keep passing the moment Johnny writes real content.
const knowledgePath = path.join(process.cwd(), 'src/app/PORTFOLIO_AI_knowledge.md');
const knowledgeRaw = fs.readFileSync(knowledgePath, 'utf8');
const knowledgeProse = extractKnowledgeProse(knowledgeRaw);
if (knowledgeProse) {
  assert.ok(
    prompt.includes('More about Johnny'),
    'PORTFOLIO_AI_knowledge.md has prose, so the prompt should include the "More about Johnny" section',
  );
} else {
  assert.ok(
    !prompt.includes('More about Johnny'),
    'PORTFOLIO_AI_knowledge.md is headings-only, so the prompt should not include an empty "More about Johnny" section',
  );
}

console.log('check-knowledge: ok');
