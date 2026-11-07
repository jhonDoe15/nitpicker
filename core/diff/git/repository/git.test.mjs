import { utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commit, fixtureGit, useGitFixtures } from '../test-support/git-repository.mjs';
import { captureWorkingTree, resolveComparison } from './git.mjs';

const { createGitRepository } = useGitFixtures();

const SECOND = Date.UTC(2026, 0, 1) / 1000;

describe('captureWorkingTree', () => {
  it.each([
    ['at the start of', 0],
    ['at the very end of', 0.9996],
  ])(
    'captures a same-size edit when the index was written %s that second',
    (_moment, indexOffset) => {
      const repository = createGitRepository();
      fixtureGit(repository.root, ['config', 'core.checkStat', 'minimal']);
      const filePath = path.join(repository.root, 'a.txt');
      writeFileSync(filePath, 'old\n');
      utimesSync(filePath, SECOND, SECOND);
      commit(repository.root, 'add a');
      const headSha = fixtureGit(repository.root, ['rev-parse', 'HEAD']).trim();
      const indexTime = SECOND + indexOffset;
      utimesSync(path.join(repository.root, '.git', 'index'), indexTime, indexTime);
      writeFileSync(filePath, 'new\n');
      utimesSync(filePath, SECOND, SECOND);

      const capturedSha = captureWorkingTree(repository.root, headSha);

      expect(fixtureGit(repository.root, ['show', `${capturedSha}:a.txt`])).toBe('new\n');
    },
  );
});

describe('resolveComparison', () => {
  it.each([
    [
      [],
      'develop',
      'The repository has no remote to fetch it from: pass a local branch, tag or commit that HEAD shares history with.',
    ],
    [
      ['gitlab'],
      'develop',
      'No remote is named "origin" (remotes: gitlab). Fetch the branch from one and retry.',
    ],
    [
      ['gitlab', 'github'],
      'origin/develop',
      'No remote is named "origin" (remotes: github, gitlab). Fetch the branch from one and retry.',
    ],
    [
      ['gitlab'],
      'release/1.x',
      'No remote is named "release" or "origin" (remotes: gitlab). Fetch the branch from one and retry.',
    ],
    [['gitlab'], 'gitlab/develop', "Run `git fetch 'gitlab' 'develop'` and retry."],
    [['origin'], 'release/1.x', "Run `git fetch 'origin' 'release/1.x'` and retry."],
  ])('with remotes %j, says how to get a missing %s', (remotes, baseRef, advice) => {
    const repository = createGitRepository();
    for (const remote of remotes) {
      fixtureGit(repository.root, ['remote', 'add', remote, path.join(repository.root, remote)]);
    }

    expect(() => resolveComparison(repository.root, baseRef)).toThrow(
      new Error(`Cannot resolve base ref "${baseRef}". ${advice}`),
    );
  });
});
