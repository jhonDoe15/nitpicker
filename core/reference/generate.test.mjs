import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { entryProblems } from './build.mjs';
import { formattedText, referenceFiles, staleReferenceFiles } from './generate.mjs';
import { PAGES } from '../../shared/reference/pages.mjs';
import { ruleEntry } from '../../shared/reference/entry.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');
const roots = [];
const PAGE_LIMIT = 512 * 1024;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-reference-'));
  roots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), contents);
  }
  return root;
}

function entry(rule, fields = {}) {
  return ruleEntry({ tool: 'demo', rule, page: PAGES[0].id, ...fields });
}

describe('the generated rule reference', () => {
  it('is up to date, and each page stays under the 512 KB GitHub renders: the committed data files and pages equal what the catalogs generate', () => {
    const generated = referenceFiles(REPOSITORY_ROOT);

    expect([...generated.keys()].toSorted()).toEqual(
      [
        ...PAGES.map(({ id }) => `shared/reference/rules/${id}.json`),
        ...PAGES.map(({ id }) => `docs/rules/${id}.md`),
        'docs/rules/README.md',
      ].toSorted(),
    );
    expect(staleReferenceFiles(REPOSITORY_ROOT, generated)).toEqual([]);
    expect(
      [...generated]
        .filter(([file, text]) => file.endsWith('.md') && Buffer.byteLength(text) >= PAGE_LIMIT)
        .map(([file]) => file),
    ).toEqual([]);
  });
});

describe('the generated pages', () => {
  it.each(['docs/rules/README.md', 'docs/rules/python-nitpicker.md'])(
    'are already in the form Prettier gives %s',
    async (file) => {
      const text = referenceFiles(REPOSITORY_ROOT).get(file);

      expect(await formattedText(REPOSITORY_ROOT, file, text)).toBe(text);
    },
  );
});

describe('staleReferenceFiles', () => {
  it('lists the files that differ from the generated text or are missing', () => {
    const root = project({ 'a.md': 'same\n', 'b.md': 'old\n', 'd.json': '[\n  { "a": 1 }\n]\n' });
    const generated = new Map([
      ['a.md', 'same\n'],
      ['b.md', 'new\n'],
      ['c.md', 'new\n'],
      ['d.json', '[{"a":1}]'],
      ['e.json', '[]'],
    ]);

    expect(staleReferenceFiles(root, generated)).toEqual(['b.md', 'c.md', 'e.json']);
  });
});

describe('entryProblems', () => {
  it('accepts entries with distinct ids and anchors on known pages', () => {
    const root = project({});

    expect(entryProblems([entry('one'), entry('two')], root)).toEqual([]);
  });

  it('reports duplicate ids and anchors and unknown pages', () => {
    const root = project({});

    expect(
      entryProblems(
        [entry('one'), entry('one'), entry('two', { page: 'nowhere' }), entry('Three')],
        root,
      ),
    ).toEqual([
      'duplicate id demo/one',
      'duplicate anchor demo-one',
      'demo/two: unknown page nowhere',
    ]);
  });

  it('reports a guide link to a file or a heading that does not exist', () => {
    const root = project({ 'docs/guide.md': '# Guide\n\n## Error Prone and NullAway\n' });
    const link = (docsPath, anchor) =>
      entry('one', { docs: [{ label: 'Guide', path: docsPath, anchor }] });

    expect(entryProblems([link('docs/guide.md', 'error-prone-and-nullaway')], root)).toEqual([]);
    expect(entryProblems([link('docs/guide.md')], root)).toEqual([]);
    expect(entryProblems([link('docs/guide.md', 'missing')], root)).toEqual([
      'demo/one: docs/guide.md has no heading #missing',
    ]);
    expect(entryProblems([link('docs/gone.md')], root)).toEqual([
      'demo/one: docs/gone.md does not exist',
    ]);
  });
});
