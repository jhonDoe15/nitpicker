import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  fixtureGit,
  removeGitRepositories,
} from '../../../../core/diff/fixtures/git-repository.mjs';
import { isSourceFile } from '../../preset/layout.mjs';
import { mutationTargets } from './runners/mutation-scope.mjs';

const layout = { isSourceFile };
const BASE_SOURCE = [
  'export const one = 1;',
  'export const two = 2;',
  'export const three = 3;',
  '',
];

afterEach(removeGitRepositories);

function writeFile(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function snapshots({ project = '.', headChanges = {}, removed = [], renamed = [] }) {
  const { root } = createGitRepository({
    [`${project}/src/math.ts`]: BASE_SOURCE.join('\n'),
    [`${project}/src/old-name.ts`]: BASE_SOURCE.join('\n'),
    [`${project}/package.json`]: '{}\n',
  });
  const baselineRoot = path.join(root, '.base-worktree', project);
  fixtureGit(root, ['worktree', 'add', '-q', '--detach', '.base-worktree', 'HEAD']);
  for (const [from, to] of renamed) {
    fixtureGit(root, ['mv', path.join(project, from), path.join(project, to)]);
  }
  for (const relativePath of removed) {
    rmSync(path.join(root, project, relativePath));
  }
  for (const [relativePath, contents] of Object.entries(headChanges)) {
    writeFile(root, path.join(project, relativePath), contents);
  }
  fixtureGit(root, ['add', '-A', '--', ':!.base-worktree']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'head']);
  return { baselineRoot, projectRoot: path.join(root, project) };
}

function headTargets(roots) {
  return mutationTargets({ snapshot: 'head', ...roots }, layout);
}

describe('mutationTargets', () => {
  it('mutates only the changed lines of changed source files', () => {
    const roots = snapshots({
      headChanges: {
        'src/math.ts': [
          'export const one = 1;',
          'export const two = 20;',
          'export const three = 3;',
          '',
        ].join('\n'),
      },
    });

    expect(headTargets(roots)).toEqual(['src/math.ts:2-2']);
  });

  it('mutates every line of a new source file', () => {
    const roots = snapshots({
      headChanges: { 'src/added.ts': 'export const a = 1;\nexport const b = 2;\n' },
    });

    expect(headTargets(roots)).toEqual(['src/added.ts:1-2']);
  });

  it('ignores tests, deleted lines and files outside the source roots', () => {
    const roots = snapshots({
      headChanges: {
        'src/math.ts': ['export const one = 1;', 'export const three = 3;', ''].join('\n'),
        'src/math.test.ts': 'export {};\n',
        'package.json': '{"type":"module"}\n',
      },
    });

    expect(headTargets(roots)).toEqual([]);
  });

  it('mutates nothing in a renamed file except its edited lines', () => {
    const roots = snapshots({
      renamed: [['src/old-name.ts', 'src/new-name.ts']],
      headChanges: {
        'src/new-name.ts': [
          'export const one = 10;',
          'export const two = 2;',
          'export const three = 3;',
          '',
        ].join('\n'),
      },
    });

    expect(headTargets(roots)).toEqual(['src/new-name.ts:1-1']);
  });

  it('reports paths relative to a project in a subdirectory', () => {
    const roots = snapshots({
      project: 'packages/app',
      headChanges: { 'src/math.ts': 'export const one = 2;\n' },
    });

    expect(headTargets(roots)).toEqual(['src/math.ts:1-1']);
  });

  it('mutates nothing when no source file changed', () => {
    const roots = snapshots({ removed: ['src/old-name.ts'] });

    expect(headTargets(roots)).toEqual([]);
  });

  it('never mutates the base snapshot, whose survivors could not be new', () => {
    const roots = snapshots({ headChanges: { 'src/math.ts': 'export const one = 2;\n' } });

    expect(mutationTargets({ snapshot: 'base', ...roots }, layout)).toEqual([]);
  });

  it('keeps the configured scope for a whole-project run', () => {
    const roots = snapshots({ headChanges: { 'src/math.ts': 'export const one = 2;\n' } });

    expect(
      mutationTargets({ snapshot: 'head', projectRoot: roots.projectRoot }, layout),
    ).toBeUndefined();
  });
});
