import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../../core/diff/git/test-support/git-repository.mjs';
import {
  changedFilesOf,
  isMultiModule,
  repositoryChangeKey,
  notAffectedFindings,
  withChangedFiles,
} from './changed-files.mjs';

const { createGitRepository } = useGitFixtures();

function snapshots(headChanges, removed = []) {
  const { root } = createGitRepository({
    'pom.xml': '<project><modules><module>core</module></modules></project>',
    'core/pom.xml': '<project/>',
    'core/src/Core.java': 'class Core {}\n',
    'core/src/gone/Gone.java': 'class Gone {}\n',
    'old/pom.xml': '<project/>',
    'old/src/Old.java': 'class Old {}\n',
  });
  const base = path.join(root, '.base-worktree');
  fixtureGit(root, ['worktree', 'add', '-q', '--detach', '.base-worktree', 'HEAD']);
  for (const file of removed) {
    rmSync(path.join(root, file), { recursive: true, force: true });
  }
  for (const [file, contents] of Object.entries(headChanges)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), contents);
  }
  fixtureGit(root, ['add', '-A', '--', ':!.base-worktree']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'head']);
  return { base, head: root };
}

describe('changedFilesOf', () => {
  const head = (roots) => ({ snapshot: 'head', baselineRoot: roots.base });
  const base = (roots) => ({ snapshot: 'base', policyRoot: roots.head });

  it('lists the same files on both snapshots, also for a new package in a module', () => {
    const roots = snapshots({
      'core/src/Core.java': 'class Core { int a; }\n',
      'core/src/fresh/Fresh.java': 'class Fresh {}\n',
    });
    const expected = ['core/src/Core.java', 'core/src/fresh/Fresh.java'];

    expect(changedFilesOf(roots.head, head(roots))).toEqual(expected);
    expect(changedFilesOf(roots.base, base(roots))).toEqual(expected);
  });

  it('lists the same files on both snapshots when a package folder of a module is deleted', () => {
    const roots = snapshots({}, ['core/src/gone']);

    expect(changedFilesOf(roots.head, head(roots))).toEqual(['core/src/gone/Gone.java']);
    expect(changedFilesOf(roots.base, base(roots))).toEqual(['core/src/gone/Gone.java']);
  });

  it.each([
    ['deleted', () => snapshots({}, ['old'])],
    [
      'added',
      () => snapshots({ 'new/pom.xml': '<project/>', 'new/src/New.java': 'class New {}\n' }),
    ],
  ])('gates everything on both snapshots when a whole module is %s', (_kind, build) => {
    const roots = build();

    expect(changedFilesOf(roots.head, head(roots))).toBeUndefined();
    expect(changedFilesOf(roots.base, base(roots))).toBeUndefined();
  });

  it('is unknown without a comparison', () => {
    const roots = snapshots({ 'core/src/Core.java': 'class Core { int a; }\n' });

    expect(changedFilesOf(roots.head, { snapshot: 'head' })).toBeUndefined();
    expect(withChangedFiles({ policy: {} }, roots.head).policy.changedFiles).toBeUndefined();
  });

  it('gates everything when a change outside the project folder is hidden by the relative diff', () => {
    const roots = snapshots({
      'pom.xml': '<project><modules><module>core</module></modules><!-- x --></project>',
      'core/src/Core.java': 'class Core { int a; }\n',
    });
    const inCore = (root) => path.join(root, 'core');

    expect(
      changedFilesOf(inCore(roots.head), { snapshot: 'head', baselineRoot: inCore(roots.base) }),
    ).toBeUndefined();
    expect(
      changedFilesOf(inCore(roots.base), { snapshot: 'base', policyRoot: inCore(roots.head) }),
    ).toBeUndefined();
  });
});

describe('repositoryChangeKey', () => {
  it('names every changed file of the repository, also outside the project folder', () => {
    const roots = snapshots({
      'core/src/Core.java': 'class Core { int a; }\n',
      'README.md': 'x\n',
    });
    const sha = fixtureGit(roots.head, ['rev-parse', 'HEAD~1']).trim();
    const key = repositoryChangeKey(path.join(roots.head, 'core'), sha);

    expect(key).toBe('\nA\tREADME.md\nM\tcore/src/Core.java');
    expect(repositoryChangeKey(roots.head, undefined)).toBe('unknown');
  });
});

describe('isMultiModule', () => {
  it('sees a reactor or a Gradle settings file that includes projects, here or above', () => {
    const roots = snapshots({ 'core/src/Core.java': 'class Core { int a; }\n' });

    expect(isMultiModule(roots.head)).toBe(true);
    expect(isMultiModule(path.join(roots.head, 'core'))).toBe(true);
  });
});

describe('notAffectedFindings', () => {
  it('is one descriptive finding on the head snapshot only', () => {
    const [finding] = notAffectedFindings(['web', 'core'], { snapshot: 'head', preset: 'kotlin' });

    expect(finding).toEqual({
      tool: 'kotlin',
      rule: 'modules-not-affected',
      path: '.',
      identity: 'modules-not-affected|core,web',
      message: 'modules not affected: core, web',
      classification: 'descriptive',
    });
    expect(notAffectedFindings(['web'], { snapshot: 'base' })).toEqual([]);
    expect(notAffectedFindings([], { snapshot: 'head' })).toEqual([]);
  });
});
