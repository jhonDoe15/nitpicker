import { utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commit, fixtureGit, useGitFixtures } from '../test-support/git-repository.mjs';
import { captureWorkingTree } from './git.mjs';

const { createGitRepository } = useGitFixtures();

const SAME_SECOND = new Date('2026-01-01T00:00:00Z');

describe('captureWorkingTree', () => {
  it('captures a same-size edit made in the second the index was written', () => {
    const repository = createGitRepository();
    fixtureGit(repository.root, ['config', 'core.checkStat', 'minimal']);
    const filePath = path.join(repository.root, 'a.txt');
    writeFileSync(filePath, 'old\n');
    utimesSync(filePath, SAME_SECOND, SAME_SECOND);
    commit(repository.root, 'add a');
    const headSha = fixtureGit(repository.root, ['rev-parse', 'HEAD']).trim();
    utimesSync(path.join(repository.root, '.git', 'index'), SAME_SECOND, SAME_SECOND);
    writeFileSync(filePath, 'new\n');
    utimesSync(filePath, SAME_SECOND, SAME_SECOND);

    const capturedSha = captureWorkingTree(repository.root, headSha);

    expect(fixtureGit(repository.root, ['show', `${capturedSha}:a.txt`])).toBe('new\n');
  });
});
