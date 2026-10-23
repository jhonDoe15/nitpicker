import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CO_CHANGE_DEFAULTS } from '../../../project-rules/hygiene-rules.mjs';
import { collectEvidence, significantPairs } from './evidence.mjs';

const SETTINGS = { ...CO_CHANGE_DEFAULTS, minSupport: 3 };
const PERFORMANCE_BUDGET_MS = 2000;

function moduleOf(file) {
  return file.startsWith('src/') && !file.endsWith('.test.ts')
    ? path.posix.dirname(file)
    : undefined;
}

function commitOf(sha, entries) {
  return { sha, entries };
}

function edits(...files) {
  return files.map((file) => ({ kind: 'M', exact: false, path: file }));
}

function adds(...files) {
  return files.map((file) => ({ kind: 'A', exact: false, path: file }));
}

function times(count, makeEntries) {
  return Array.from({ length: count }, (_, index) =>
    commitOf(`sha${String(index)}`, makeEntries(index)),
  );
}

function pairsOf(commits, settings = SETTINGS) {
  return significantPairs(collectEvidence({ commits, moduleOf, settings }), settings).map(
    ({ first, second, support, firstCommits, secondCommits }) => ({
      first,
      second,
      support,
      firstCommits,
      secondCommits,
    }),
  );
}

describe('collectEvidence', () => {
  it('pairs modules whose code is edited in the same commit', () => {
    expect(pairsOf(times(3, () => edits('src/a/one.ts', 'src/b/two.ts')))).toEqual([
      { first: 'src/a', second: 'src/b', support: 3, firstCommits: 3, secondCommits: 3 },
    ]);
  });

  it('never pairs a module with its own parent or child folder', () => {
    const commits = times(4, () => edits('src/pay/pay.ts', 'src/pay/handlers/card.ts'));

    expect(pairsOf(commits)).toEqual([]);
  });

  it('needs edits in two modules: added code, docs and tests are no evidence', () => {
    const commits = [
      ...times(4, (index) => [
        ...edits('docs/guide.md', 'src/a/one.test.ts'),
        ...adds(`src/a/new${String(index)}.ts`, `src/b/new${String(index)}.ts`),
      ]),
      ...times(4, (index) => [...edits('src/a/one.ts'), ...adds(`src/c/new${String(index)}.ts`)]),
    ];
    const evidence = collectEvidence({ commits, moduleOf, settings: SETTINGS });

    expect({ used: evidence.used, pairs: pairsOf(commits) }).toEqual({ used: 4, pairs: [] });
  });

  it('counts a commit that edits one module alone against that module', () => {
    const commits = [
      ...times(3, () => edits('src/a/one.ts', 'src/b/two.ts')),
      ...times(3, () => edits('src/a/one.ts')),
    ];

    expect(pairsOf(commits, { ...SETTINGS, minConfidence: 0.5 })).toEqual([
      { first: 'src/a', second: 'src/b', support: 3, firstCommits: 6, secondCommits: 3 },
    ]);
  });

  it('skips commits with more files than the limit', () => {
    const commits = times(4, () => edits('src/a/one.ts', 'src/b/two.ts', 'src/c/three.ts'));

    expect(pairsOf(commits, { ...SETTINGS, maxCommitFiles: 2 })).toEqual([]);
  });

  it('names a renamed file by its newest path', () => {
    const commits = [
      commitOf('rename', [
        { kind: 'R', exact: true, from: 'src/old/one.ts', path: 'src/a/one.ts' },
      ]),
      ...times(3, () => edits('src/old/one.ts', 'src/b/two.ts')),
    ];

    expect(pairsOf(commits).map(({ first, second }) => [first, second])).toEqual([
      ['src/a', 'src/b'],
    ]);
  });

  it('reads 2000 commits of 60 modules within the budget', () => {
    const modules = Array.from({ length: 60 }, (_, index) => `src/m${String(index)}/file.ts`);
    const commits = times(2000, (index) => edits(...modules.slice(index % 30, (index % 30) + 30)));
    const startedAt = performance.now();
    const pairs = pairsOf(commits, { ...SETTINGS, maxCommitFiles: 100 });

    expect({
      pairs: pairs.length,
      fast: performance.now() - startedAt < PERFORMANCE_BUDGET_MS,
    }).toEqual({ pairs: 1102, fast: true });
  });
});
