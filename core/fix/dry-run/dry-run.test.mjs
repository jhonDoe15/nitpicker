import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { createSnapshot } from '../engine/edits/snapshot.mjs';
import { defineRecipes } from '../engine/recipes.mjs';
import { runRecipes } from '../engine/run-recipes.mjs';
import { writeTexts } from '../engine/write-texts.mjs';
import { dryRun } from './dry-run.mjs';
import { createJournal, journalWriter } from './journal.mjs';
import { journalPath } from './journal-file.mjs';
import { applyPatch, treeOf } from './test-support/tree.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();

const RULE = { tool: 'demo', rule: 'shout' };
const FILES = {
  'sub/a.txt': 'quiet one\n',
  'sub/b.txt': 'quiet two\n',
  'sub/old.txt': 'moves\n',
  'sub/gone.txt': 'goes\n',
  'keep.bin': 'unchanged\n',
};

function finding(name) {
  return { ...RULE, path: name, line: 1 };
}

const recipes = defineRecipes([
  {
    id: 'shout',
    rules: [RULE],
    presets: ['java'],
    scope: 'project',
    safety: 'safe',
    plan: ({ files }) => ({
      fixes: files.flatMap(({ path: name, text }) =>
        text.includes('quiet')
          ? [
              {
                finding: finding(name),
                edits: [{ type: 'replace', path: name, start: 0, end: 5, text: 'LOUD' }],
              },
            ]
          : [],
      ),
    }),
  },
  {
    id: 'restructure',
    rules: [{ tool: 'demo', rule: 'restructure' }],
    presets: ['java'],
    scope: 'project',
    safety: 'safe',
    plan: ({ files }) => ({
      fixes: files.some(({ path: name }) => name === 'sub/old.txt')
        ? [
            {
              finding: { tool: 'demo', rule: 'restructure', path: 'sub/old.txt', line: 1 },
              edits: [
                { type: 'move', from: 'sub/old.txt', to: 'deep/er/new.txt' },
                { type: 'delete', path: 'sub/gone.txt' },
                { type: 'write', path: 'created/file.txt', text: 'made\n' },
              ],
            },
          ]
        : [],
    }),
  },
]);

function sample() {
  const root = temporaryRoot('nitpicker-dry-run-');
  writeFiles(root, FILES);
  chmodSync(path.join(root, 'sub/a.txt'), 0o755);
  return root;
}

function fixTree(root, writer) {
  const files = Object.keys(FILES).map((name) => ({ path: name }));
  return runRecipes({
    projectRoot: root,
    files,
    recipes,
    preset: 'java',
    accepts: () => true,
    writer,
  });
}

function dry(root, run) {
  const journal = createJournal(root);
  return dryRun({
    repositoryRoot: root,
    journal,
    run: () => run(journalWriter(journal)),
  });
}

describe('dryRun', () => {
  it('leaves the tree as it was and gives a patch that makes the tree a real run makes', () => {
    const root = sample();
    const real = temporaryRoot('nitpicker-dry-run-real-');
    cpSync(root, real, { recursive: true });
    const before = treeOf(root);

    const outcome = dry(root, (writer) => fixTree(root, writer));

    expect(treeOf(root)).toEqual(before);
    expect(existsSync(path.join(root, 'created'))).toBe(false);
    expect(existsSync(path.join(root, 'deep'))).toBe(false);
    expect(outcome.files).toEqual([
      'created/file.txt',
      'deep/er/new.txt',
      'sub/a.txt',
      'sub/b.txt',
      'sub/gone.txt',
      'sub/old.txt',
    ]);
    expect(outcome.fixes.map(({ recipe, safety }) => [recipe, safety]).toSorted()).toEqual([
      ['restructure', 'safe'],
      ['shout', 'safe'],
      ['shout', 'safe'],
    ]);
    expect(outcome.fixes.find(({ recipe }) => recipe === 'restructure').files).toEqual([
      'sub/old.txt',
      'deep/er/new.txt',
      'sub/gone.txt',
      'created/file.txt',
    ]);
    fixTree(real);
    const patchFile = path.join(temporaryRoot('nitpicker-dry-run-patch-'), 'fix.patch');
    writeFileSync(patchFile, outcome.patch);
    applyPatch(root, patchFile);
    expect(treeOf(root)).toEqual(treeOf(real));
  });
  it('records the tool of a whole-file write, and keeps paths relative to the repository root', () => {
    const repository = temporaryRoot('nitpicker-dry-run-nested-');
    mkdirSync(path.join(repository, 'app'));
    writeFileSync(path.join(repository, 'app/a.txt'), 'a  b\n');
    const projectRoot = path.join(repository, 'app');
    const bytes = readFileSync(path.join(projectRoot, 'a.txt'));
    const journal = createJournal(projectRoot);

    const outcome = dryRun({
      repositoryRoot: repository,
      journal,
      run: () =>
        writeTexts(journalWriter(journal), [{ name: 'a.txt', bytes, text: 'a b\n' }], 'squeeze'),
    });

    expect(outcome.fixes).toEqual([{ tool: 'squeeze', safety: 'safe', files: ['app/a.txt'] }]);
    const headers = outcome.patch
      .toString('utf8')
      .split('\n')
      .filter((line) => line.startsWith('--- ') || line.startsWith('+++ '));
    expect(headers).toEqual(['--- a/app/a.txt', '+++ b/app/a.txt']);
    expect(readFileSync(path.join(projectRoot, 'a.txt'), 'utf8')).toBe('a  b\n');
  });
  it('puts a path an untrack edit removed back into the git index', () => {
    const { root } = createGitRepository({ '.env': 'A=1\n', 'a.txt': 'a\n' });
    const journal = createJournal(root);
    const entries = [
      {
        recipe: 'untrack',
        safety: 'review',
        fix: {
          finding: { tool: 'demo', rule: 'x', path: '.env', line: 1 },
          edits: [{ type: 'untrack', path: '.env' }],
        },
      },
    ];
    let during;

    const outcome = dryRun({
      repositoryRoot: root,
      journal,
      run: () => {
        const snapshot = createSnapshot(root, ['.env']);
        journalWriter(journal).apply(snapshot, entries);
        during = fixtureGit(root, ['ls-files']);
      },
    });

    expect(during).toBe('a.txt\n');
    expect(fixtureGit(root, ['ls-files'])).toBe('.env\na.txt\n');
    expect(outcome.fixes).toEqual([
      {
        recipe: 'untrack',
        safety: 'review',
        finding: { tool: 'demo', rule: 'x', path: '.env', line: 1 },
        files: ['.env'],
      },
    ]);
  });
  it('restores the tree when the run throws', () => {
    const root = sample();
    const before = treeOf(root);

    expect(() =>
      dry(root, (writer) => {
        fixTree(root, writer);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(treeOf(root)).toEqual(before);
    expect(existsSync(path.join(root, 'created'))).toBe(false);
  });
  it('gives an empty patch when nothing changes', () => {
    const root = sample();

    const outcome = dry(root, () => 'nothing');

    expect(outcome.patch.length).toBe(0);
    expect(outcome.fixes).toEqual([]);
  });
  it('restores a read-only file and keeps its mode', () => {
    const root = sample();
    chmodSync(path.join(root, 'sub/a.txt'), 0o444);
    const before = treeOf(root);

    dry(root, (writer) => fixTree(root, writer));

    expect(treeOf(root)).toEqual(before);
    expect(statSync(path.join(root, 'sub/a.txt')).mode & 0o777).toBe(0o444);
  });
  it('leaves a file the user edited during the run as the user wrote it', () => {
    const root = sample();
    const edited = path.join(root, 'sub/a.txt');

    expect(() =>
      dry(root, (writer) => {
        fixTree(root, writer);
        writeFileSync(edited, 'LOUD one\nmy own line\n');
      }),
    ).toThrow(/sub\/a\.txt.*changed while the dry run ran/u);

    expect(readFileSync(edited, 'utf8')).toBe('LOUD one\nmy own line\n');
    expect(readFileSync(path.join(root, 'sub/b.txt'), 'utf8')).toBe('quiet two\n');
  });
  it('puts the files back that an interrupted dry run left changed, on the next run', () => {
    const root = sample();
    const record = path.join(temporaryRoot('nitpicker-dry-run-record-'), 'journal.json');
    const fixed = {};
    dry(root, (writer) => {
      fixTree(root, writer);
      copyFileSync(journalPath(root), record);
      for (const name of ['sub/a.txt', 'sub/b.txt']) {
        fixed[name] = readFileSync(path.join(root, name));
      }
    });
    copyFileSync(record, journalPath(root));
    for (const [name, bytes] of Object.entries(fixed)) {
      writeFileSync(path.join(root, name), bytes);
    }
    writeFileSync(path.join(root, 'sub/b.txt'), 'LOUD two\nand more\n');

    const outcome = dry(root, () => 'nothing');

    expect(outcome.recovered).toHaveLength(2);
    expect(outcome.recovered[1]).toBe(
      `--fix --dry-run could not restore ${path.join(root, 'sub/b.txt')}: changed while the dry run ran, left as is`,
    );
    expect(readFileSync(path.join(root, 'sub/a.txt'), 'utf8')).toBe('quiet one\n');
    expect(readFileSync(path.join(root, 'sub/b.txt'), 'utf8')).toBe('LOUD two\nand more\n');
    expect(existsSync(journalPath(root))).toBe(false);
  });
  it('removes its record when the run ends', () => {
    const root = sample();

    dry(root, (writer) => fixTree(root, writer));

    expect(existsSync(journalPath(root))).toBe(false);
  });
});
