import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  fixtureGit,
  removeGitRepositories,
} from '../../../core/diff/fixtures/git-repository.mjs';
import { isRunnableTestFile, isSourceFile } from '../preset/layout.mjs';
import { MUTATION_INCREMENTAL_PATH, reusableBaseMutationResults } from './mutation-incremental.mjs';

const layout = { isSourceFile, isRunnableTestFile };

afterEach(removeGitRepositories);

function writeFile(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function snapshots({ project = '.', headChanges, baseResults = true }) {
  const { root } = createGitRepository({
    [`${project}/src/math.ts`]: 'export const one = 1;\n',
    [`${project}/package.json`]: '{}\n',
    'README.md': 'base\n',
  });
  const baselineRoot = path.join(root, '.base-worktree', project);
  fixtureGit(root, ['worktree', 'add', '-q', '--detach', '.base-worktree', 'HEAD']);
  if (baseResults) writeFile(baselineRoot, MUTATION_INCREMENTAL_PATH, '{}');
  for (const [relativePath, contents] of Object.entries(headChanges)) {
    writeFile(root, relativePath, contents);
  }
  fixtureGit(root, ['add', '-A', '--', ':!.base-worktree']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'head']);
  return { baselineRoot, projectRoot: path.join(root, project) };
}

describe('reusableBaseMutationResults', () => {
  it('reuses base results when only sources and tests changed', () => {
    const roots = snapshots({
      headChanges: { 'src/math.ts': 'export const one = 2;\n', 'src/math.test.ts': '' },
    });

    expect(reusableBaseMutationResults({ snapshot: 'head', ...roots }, layout)).toBe(
      path.join(roots.baselineRoot, MUTATION_INCREMENTAL_PATH),
    );
  });

  it('runs every mutant when a file other than a source or test changed', () => {
    const roots = snapshots({ headChanges: { 'package.json': '{"type":"module"}\n' } });

    expect(reusableBaseMutationResults({ snapshot: 'head', ...roots }, layout)).toBeUndefined();
  });

  it('runs every mutant when a file outside the project changed', () => {
    const roots = snapshots({
      project: 'packages/app',
      headChanges: { 'README.md': 'head\n', 'packages/app/src/math.ts': '' },
    });

    expect(reusableBaseMutationResults({ snapshot: 'head', ...roots }, layout)).toBeUndefined();
  });

  it('reuses base results for a project in a subdirectory', () => {
    const roots = snapshots({
      project: 'packages/app',
      headChanges: { 'packages/app/src/math.ts': 'export const one = 2;\n' },
    });

    expect(reusableBaseMutationResults({ snapshot: 'head', ...roots }, layout)).toBe(
      path.join(roots.baselineRoot, MUTATION_INCREMENTAL_PATH),
    );
  });

  it('runs every mutant when the base run left no results', () => {
    const roots = snapshots({
      headChanges: { 'src/math.ts': 'export const one = 2;\n' },
      baseResults: false,
    });

    expect(reusableBaseMutationResults({ snapshot: 'head', ...roots }, layout)).toBeUndefined();
  });

  it('never seeds the base snapshot', () => {
    const roots = snapshots({ headChanges: { 'src/math.ts': 'export const one = 2;\n' } });

    expect(reusableBaseMutationResults({ snapshot: 'base', ...roots }, layout)).toBeUndefined();
  });
});
