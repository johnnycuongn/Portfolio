import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RESUME } from '../src/app/PORTFOLIO';
import { RESUME_PAGES } from '../src/app/_resume/pages';

// Every string the dialog puts on screen has to actually say something.
for (const [key, value] of Object.entries(RESUME)) {
  assert.equal(typeof value, 'string', `RESUME.${key} must be a string`);
  assert.ok(value.length > 0, `RESUME.${key} must not be empty`);
}

// The alt template carries both substitutions or pages lose their numbering.
assert.ok(RESUME.pageAlt.includes('{n}'), 'pageAlt needs an {n} placeholder');
assert.ok(RESUME.pageAlt.includes('{total}'), 'pageAlt needs a {total} placeholder');

// The PDF is served from public/, so the path is site-absolute and the file
// has to be on disk — it is the download target and the failure fallback.
assert.ok(RESUME.pdf.startsWith('/'), 'pdf must be a site-absolute path');
assert.ok(RESUME.pdf.endsWith('.pdf'), 'pdf must point at a PDF');
assert.ok(
  fs.existsSync(path.join(process.cwd(), 'public', RESUME.pdf)),
  `missing public${RESUME.pdf} — export the resume and drop it in`,
);

// The generated manifest and what is actually on disk must agree — a stale
// manifest would render broken images in production. This cannot detect a PDF
// that changed without a re-run: git does not preserve mtimes, so comparing
// timestamps would be flaky rather than useful.
assert.ok(RESUME_PAGES.length > 0, 'no page images — run `npm run resume`');

const pageDir = path.join(process.cwd(), 'public/resume');
const onDisk = fs.readdirSync(pageDir).filter((name) => name.endsWith('.png'));
assert.equal(
  RESUME_PAGES.length,
  onDisk.length,
  'the manifest and public/resume disagree — re-run `npm run resume`',
);

RESUME_PAGES.forEach((page, index) => {
  assert.equal(page.src, `/resume/page-${index + 1}.png`, 'pages must be numbered from 1, in order');
  assert.ok(fs.existsSync(path.join(process.cwd(), 'public', page.src)), `missing public${page.src}`);
  assert.ok(page.width > 0 && page.height > 0, `${page.src} is missing its dimensions`);
});

console.log('check-resume: ok');
