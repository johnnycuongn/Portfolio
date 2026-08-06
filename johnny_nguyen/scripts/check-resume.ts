import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RESUME } from '../src/app/PORTFOLIO';

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

console.log('check-resume: ok');
