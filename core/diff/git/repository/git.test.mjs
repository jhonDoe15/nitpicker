import { utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commit, fixtureGit, useGitFixtures } from '../test-support/git-repository.mjs';
import { captureWorkingTree } from './git.mjs';

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
