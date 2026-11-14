import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { entryProblems } from './build.mts';
import {
  formattedText,
  referenceDataFiles,
  referenceFiles,
  staleReferenceFiles,
} from './generate.mts';
import { PAGES } from '../../shared/reference/pages.mjs';
import { ruleEntry } from '../../shared/reference/entry.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');
const roots = [];
const PAGE_LIMIT = 512 * 1024;
const RELEASE_WORKFLOW = '.github/workflows/github-release.yml';

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
  it('is up to date, and each page stays under the 512 KB GitHub renders: the local data files equal what the catalogs generate', () => {
    const generated = referenceFiles(REPOSITORY_ROOT);
    const data = new Map([...generated].filter(([file]) => file.endsWith('.json')));

    expect([...generated.keys()].toSorted()).toEqual(
      [
        ...PAGES.map(({ id }) => `shared/reference/rules/${id}.json`),
        ...PAGES.map(({ id }) => `docs/rules/${id}.md`),
        'docs/rules/README.md',
      ].toSorted(),
    );
    expect(staleReferenceFiles(REPOSITORY_ROOT, data)).toEqual([]);
    expect(
      [...generated]
        .filter(([file, text]) => file.endsWith('.md') && Buffer.byteLength(text) >= PAGE_LIMIT)
        .map(([file]) => file),
    ).toEqual([]);
  });

  it('builds the data files on their own, the same as the full run, and keeps them out of git so two rule changes never merge into one', () => {
    const generated = referenceFiles(REPOSITORY_ROOT);
    const data = referenceDataFiles(REPOSITORY_ROOT);

    expect([...data.keys()].toSorted()).toEqual(
      PAGES.map(({ id }) => `shared/reference/rules/${id}.json`).toSorted(),
    );
    expect([...data].filter(([file, text]) => generated.get(file) !== text)).toEqual([]);
    expect(
      readFileSync(path.join(REPOSITORY_ROOT, '.gitignore'), 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('shared/reference/')),
    ).toEqual(['shared/reference/rules/']);
  });

  it('keeps the pages out of git, since the release workflow commits them only on the release commit', () => {
    const workflow = parse(readFileSync(path.join(REPOSITORY_ROOT, RELEASE_WORKFLOW), 'utf8'));
    const commitStep = workflow.jobs.release.steps.find(({ id }) => id === 'release-commit');

    expect(
      readFileSync(path.join(REPOSITORY_ROOT, '.gitignore'), 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('docs/')),
    ).toEqual(['docs/rules/']);
    expect(
      commitStep.run.split('\n').filter((line) => /^(?:npm run gen:rules|git add)/u.test(line)),
    ).toEqual(['npm run gen:rules', 'git add --force docs/rules']);
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

  it('checks a link to a rule page against the entries, since the pages are not on disk', () => {
    const root = project({});
    const page = `docs/rules/${PAGES[0].id}.md`;
    const link = (anchor) => entry('one', { docs: [{ label: 'Counterpart', path: page, anchor }] });

    expect(entryProblems([link('demo-one')], root)).toEqual([]);
    expect(entryProblems([link()], root)).toEqual([]);
    expect(entryProblems([link('demo-gone')], root)).toEqual([
      `demo/one: the reference has no ${page}#demo-gone`,
    ]);
  });
});
