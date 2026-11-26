import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { writeFiles } from '../../../core/diff/git/test-support/fixture-files.mts';
import { useProjectFixtures } from '../../../core/diff/git/test-support/projects/project-fixtures.mts';
import { projectFilePaths } from '../project-files.mts';
import { loadTree } from '../repository-listing.mts';
import { SEEDED_TREE_VARIABLE, seedRepositoryTree, seededTree } from './seeded-trees.mts';

const { temporaryRoot, outsideGit, gitProject, tracedGit } = useProjectFixtures();

const SOURCES = { 'src/a.ts': '', 'src/deep/b.ts': '', 'README.md': '' };

function gitCalls(logFile: string): string[] {
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((line) => line.includes('built-in: git'));
}

describe('seeded repository trees', () => {
  it('writes the listing of the repository a folder belongs to', () => {
    const root = gitProject(SOURCES);
    const file = path.join(temporaryRoot(), 'tree.json');

    expect(seedRepositoryTree(path.join(root, 'src'), file)).toEqual({
      [SEEDED_TREE_VARIABLE]: file,
    });
    expect(seededTree(root, { [SEEDED_TREE_VARIABLE]: file })).toEqual(loadTree(root));
    expect(seededTree(path.join(root, 'src'), { [SEEDED_TREE_VARIABLE]: file })).toBeUndefined();
  });

  it('seeds nothing outside a repository', () => {
    const root = outsideGit(SOURCES);

    expect(seedRepositoryTree(root, path.join(temporaryRoot(), 'tree.json'))).toEqual({});
  });

  it('lists the files of a seeded repository without running git, even after folders change', () => {
    const root = gitProject(SOURCES);
    const file = path.join(temporaryRoot(), 'tree.json');
    seedRepositoryTree(root, file);
    const logFile = path.join(temporaryRoot(), 'git.log');
    writeFileSync(logFile, '');
    tracedGit(logFile);
    vi.stubEnv(SEEDED_TREE_VARIABLE, file);

    const before = projectFilePaths(path.join(root, 'src'));
    writeFiles(root, { 'src/deep/c.ts': '' });

    expect(before).toEqual(['a.ts', 'deep/b.ts']);
    expect(projectFilePaths(path.join(root, 'src'))).toEqual(before);
    expect(gitCalls(logFile)).toEqual([]);
  });
});
