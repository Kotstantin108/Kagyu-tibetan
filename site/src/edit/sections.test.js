import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { splitSections, joinSections, replaceSection } from './sections.js';

const sample = '# head line\n\n## lesson-01\n\nPara one.\n\nPara two.\n\n## alphabet/3\n\nOnly one.\n';

test('split and join round-trip the canonical form', () => {
  const doc = splitSections(sample);
  assert.equal(doc.head, '# head line');
  assert.deepEqual(doc.sections.map((s) => s.id), ['lesson-01', 'alphabet/3']);
  assert.equal(doc.sections[0].body, 'Para one.\n\nPara two.');
  assert.equal(joinSections(doc), sample);
});

test('replaceSection changes one section only, normalises line ends and trailing space', () => {
  const out = replaceSection(sample, 'lesson-01', 'New text.\r\n\r\nMore.  \n\n\n');
  assert.equal(out, '# head line\n\n## lesson-01\n\nNew text.\n\nMore.\n\n## alphabet/3\n\nOnly one.\n');
  assert.equal(replaceSection(sample, 'lesson-01', 'Para one.\n\nPara two.'), sample);
  assert.match(replaceSection(sample, 'lesson-99', 'Added.'), /## alphabet\/3\n\nOnly one.\n\n## lesson-99\n\nAdded.\n$/);
  assert.equal(replaceSection(sample, 'alphabet/3', ''), '# head line\n\n## lesson-01\n\nPara one.\n\nPara two.\n\n## alphabet/3\n');
});

test('the real theory files are in the canonical form (round trip is byte-identical)', () => {
  const dir = new URL('../../../content/intro/', import.meta.url);
  for (const name of readdirSync(dir).filter((n) => /^[a-z]{2}\.md$/.test(n))) {
    const text = readFileSync(new URL(name, dir), 'utf8');
    assert.equal(joinSections(splitSections(text)), text, name);
  }
});
