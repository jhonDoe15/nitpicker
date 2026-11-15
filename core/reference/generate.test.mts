import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { fieldAt, listOf } from '../../scripts/json/fields.mts';
import { textOf } from '../../shared/values/readers.mts';
import { writeFiles } from '../diff/git/test-support/fixture-files.mts';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mts';
import { entryProblems } from './build.mts';
import type { ReferenceEntry } from './build.mts';
import {
  formattedText,
  referenceDataFiles,
  referenceFiles,
  staleReferenceFiles,
} from './generate.mts';
import { ALL_RECIPES as UNTYPED_RECIPES } from '../fix/engine/all-recipes.mts';
import { defineRecipes as untypedDefineRecipes } from '../fix/engine/recipes.mjs';
import { DEFAULT_FIX_SOURCES } from '../fix/status/fix-status.mts';
import { PAGES as UNTYPED_PAGES } from '../../shared/reference/pages.mjs';
import { ruleEntry as untypedRuleEntry } from '../../shared/reference/entry.mjs';

const ALL_RECIPES: readonly unknown[] = UNTYPED_RECIPES;
const PAGES: readonly { id: string }[] = UNTYPED_PAGES;
const ruleEntry: (fields: {
  tool: string;
  rule: string;
  [field: string]: unknown;
}) => ReferenceEntry = untypedRuleEntry;
const defineRecipes: (recipes: readonly unknown[]) => (typeof DEFAULT_FIX_SOURCES)['recipes'] =
  untypedDefineRecipes;

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');
const PAGE_LIMIT = 512 * 1024;
const RELEASE_WORKFLOW = '.github/workflows/github-release.yml';

const { temporaryRoot } = useGitFixtures();

function project(files: Record<string, string>) {
  const root = temporaryRoot('nitpicker-reference-');
  writeFiles(root, files);
  return root;
}

function entry(rule: string, fields: Record<string, unknown> = {}) {
  return ruleEntry({ tool: 'demo', rule, page: PAGES[0]?.id, ...fields });
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
    const workflow: unknown = parse(
      readFileSync(path.join(REPOSITORY_ROOT, RELEASE_WORKFLOW), 'utf8'),
    );
    const commitStep = listOf(fieldAt(workflow, 'jobs', 'release', 'steps')).find(
      (step) => fieldAt(step, 'id') === 'release-commit',
    );

    expect(
      readFileSync(path.join(REPOSITORY_ROOT, '.gitignore'), 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('docs/')),
    ).toEqual(['docs/rules/']);
    expect(
      textOf(fieldAt(commitStep, 'run'))
        .split('\n')
        .filter((line) => /^(?:npm run gen:rules|git add)/u.test(line)),
    ).toEqual(['npm run gen:rules', 'git add --force docs/rules']);
  });
});

describe('the generated pages', () => {
  it.each(['docs/rules/README.md', 'docs/rules/python-nitpicker.md'])(
    'are already in the form Prettier gives %s',
    async (file) => {
      const text = referenceFiles(REPOSITORY_ROOT).get(file) ?? '';

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

describe('the fix status of the reference', () => {
  const recipe = {
    id: 'demo-tab-character',
    rules: [{ tool: 'checkstyle', rule: 'FileTabCharacter' }],
    presets: ['java'],
    scope: 'file',
    safety: 'safe',
    plan: () => ({ fixes: [], notes: [] }),
  };

  it('makes the stale check fail when a recipe is added without regenerating', () => {
    const files = referenceDataFiles(REPOSITORY_ROOT);
    const committed = project(
      Object.fromEntries([...files].map(([file, text]) => [file, `${text}\n`])),
    );
    const sources = {
      ...DEFAULT_FIX_SOURCES,
      recipes: defineRecipes([...ALL_RECIPES, recipe]),
    };

    expect(staleReferenceFiles(committed, files)).toEqual([]);
    expect(staleReferenceFiles(committed, referenceDataFiles(REPOSITORY_ROOT, sources))).toEqual([
      'shared/reference/rules/java-checkstyle.json',
    ]);
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
    const link = (docsPath: string, anchor?: string) =>
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
    const page = `docs/rules/${PAGES[0]?.id ?? ''}.md`;
    const link = (anchor?: string) =>
      entry('one', { docs: [{ label: 'Counterpart', path: page, anchor }] });

    expect(entryProblems([link('demo-one')], root)).toEqual([]);
    expect(entryProblems([link()], root)).toEqual([]);
    expect(entryProblems([link('demo-gone')], root)).toEqual([
      `demo/one: the reference has no ${page}#demo-gone`,
    ]);
  });
});
