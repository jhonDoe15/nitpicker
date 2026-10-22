import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { entryProblems } from './build.mjs';
import { generatedReferenceFiles, REFERENCE_DATA_PATH, staleReferenceFiles } from './generate.mjs';
import { PAGES } from '../../shared/reference/pages.mjs';
import { ruleEntry } from '../../shared/reference/entry.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');
const GENERATION_TIMEOUT = 240_000;
const roots = [];

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
  it(
    'is up to date: the committed data file and pages equal what the catalogs generate',
    async () => {
      const generated = await generatedReferenceFiles(REPOSITORY_ROOT);

      expect(generated.has(REFERENCE_DATA_PATH)).toBe(true);
      expect(generated.size).toBe(PAGES.length + 2);
      expect(await staleReferenceFiles(REPOSITORY_ROOT, generated)).toEqual([]);
    },
    GENERATION_TIMEOUT,
  );
});

describe('staleReferenceFiles', () => {
  it('lists the files that differ from the generated text or are missing', async () => {
    const root = project({ 'a.md': 'same\n', 'b.md': 'old\n' });
    const generated = new Map([
      ['a.md', 'same\n'],
      ['b.md', 'new\n'],
      ['c.md', 'new\n'],
    ]);

    expect(await staleReferenceFiles(root, generated)).toEqual(['b.md', 'c.md']);
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
