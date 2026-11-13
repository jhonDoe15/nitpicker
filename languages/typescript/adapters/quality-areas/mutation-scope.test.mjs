import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { isSourceFile, resolveLayout } from '../../preset/layout.mjs';
import { configuredTargets, mutationTargets } from './runners/mutation-scope.mts';
import { createQualityAreaAnalyzer } from './analyzer.mjs';

const layout = { isSourceFile };
const BASE_SOURCE = [
  'export const one = 1;',
  'export const two = 2;',
  'export const three = 3;',
  '',
];

const { createGitRepository } = useGitFixtures();

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

  it('mutates no test-support/ helper in a colocated layout', () => {
    const roots = snapshots({
      headChanges: {
        'src/math.ts': 'export const one = 2;\n',
        'src/feature/test-support/make.ts': 'export const make = () => 1;\n',
      },
    });
    const colocated = resolveLayout({ colocatedTests: true });

    expect(mutationTargets({ snapshot: 'head', ...roots }, colocated)).toEqual(['src/math.ts:1-1']);
    expect(headTargets(roots)).toEqual(['src/feature/test-support/make.ts:1-1', 'src/math.ts:1-1']);
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

  it('mutates the source files under the given paths in a whole-project run', () => {
    const roots = snapshots({
      headChanges: {
        'src/orders/order.ts': 'export const order = 1;\n',
        'src/orders/order.test.ts': 'export {};\n',
        'src/orders/notes.md': 'notes\n',
      },
    });
    const options = { snapshot: 'head', projectRoot: roots.projectRoot };

    expect(mutationTargets({ ...options, mutationScope: ['src/orders'] }, layout)).toEqual([
      'src/orders/order.ts',
    ]);
    expect(mutationTargets({ ...options, mutationScope: ['src/math.ts'] }, layout)).toEqual([
      'src/math.ts',
    ]);
  });

  it('keeps only the changed lines inside the given paths in a comparison', () => {
    const roots = snapshots({
      headChanges: {
        'src/math.ts': 'export const one = 2;\n',
        'src/orders/order.ts': 'export const order = 1;\n',
      },
    });

    expect(headTargets({ ...roots, mutationScope: ['src/orders'] })).toEqual([
      'src/orders/order.ts:1-1',
    ]);
  });
});

describe('configuredTargets', () => {
  const patterns = ['src/**/*.ts', '!src/**/__tests__/**', '!src/**/*.d.ts'];

  it('drops whole files the configured mutate patterns leave out, never line ranges', () => {
    expect(
      configuredTargets(
        ['src/a.ts', 'src/__tests__/helper.ts', 'src/types.d.ts', 'src/__tests__/b.ts:1-2'],
        patterns,
      ),
    ).toEqual(['src/a.ts', 'src/__tests__/b.ts:1-2']);
    expect(configuredTargets(['src/a.ts'], undefined)).toEqual(['src/a.ts']);
  });

  it('hands Stryker file names with glob characters as literal patterns', () => {
    expect(configuredTargets(['src/app/[id]/page.ts', 'src/(group)/a.ts:3-4'], patterns)).toEqual([
      'src/app/[[]id[]]/page.ts',
      'src/[(]group[)]/a.ts:3-4',
    ]);
  });
});

describe('the mutation scope argument', () => {
  function invocationArguments(kind, mutationScope) {
    return createQualityAreaAnalyzer({ name: kind, kind }).createInvocation({
      projectRoot: '/project',
      policyRoot: '/policy',
      toolRoot: '/tool',
      snapshot: 'head',
      mutationScope,
    }).args;
  }

  it('reaches the mutation runner only', () => {
    expect(invocationArguments('mutation', ['src/orders']).slice(-2)).toEqual([
      '--mutation-scope',
      '["src/orders"]',
    ]);
    expect(invocationArguments('coverage', ['src/orders'])).not.toContain('--mutation-scope');
    expect(invocationArguments('mutation', undefined)).not.toContain('--mutation-scope');
  });
});
