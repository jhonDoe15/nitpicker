import { mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commit, fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { commitSource, workingTreeSource } from '../sources.mjs';

const { createGitRepository } = useGitFixtures();

function repositoryWithLinks() {
  const { root } = createGitRepository({
    'shared/checkstyle.xml': '<module name="Checker"/>',
    'shared/second.xml': 'second',
    'outside.txt': 'outside',
    'app/inside.txt': 'inside',
  });
  mkdirSync(path.join(root, 'config/checkstyle'), { recursive: true });
  symlinkSync('../../shared/checkstyle.xml', path.join(root, 'config/checkstyle/checkstyle.xml'));
  symlinkSync('checkstyle/checkstyle.xml', path.join(root, 'config/chained.xml'));
  symlinkSync('../outside.txt', path.join(root, 'app/escape.txt'));
  symlinkSync('missing.xml', path.join(root, 'config/dangling.xml'));
  symlinkSync('loop-b', path.join(root, 'config/loop-a'));
  symlinkSync('loop-a', path.join(root, 'config/loop-b'));
  commit(root, 'links');
  return root;
}

const LINKS = [
  'config/checkstyle/checkstyle.xml',
  'config/chained.xml',
  'config/dangling.xml',
  'config/loop-a',
];

describe('a symbolic link in the sources', () => {
  it('is read through its target inside the tree in the merge base, the way the working tree reads it', () => {
    const root = repositoryWithLinks();
    const commitSha = fixtureGit(root, ['rev-parse', 'HEAD']).trim();

    const fromCommit = commitSource({ repositoryRoot: root, commitSha, projectRoot: root });
    const fromTree = workingTreeSource(root);

    expect(fromCommit.readMany(LINKS)).toEqual(
      new Map([
        ['config/checkstyle/checkstyle.xml', '<module name="Checker"/>'],
        ['config/chained.xml', '<module name="Checker"/>'],
      ]),
    );
    expect(fromTree.readMany(LINKS)).toEqual(fromCommit.readMany(LINKS));
  });

  it('is not followed out of the project folder, in either source', () => {
    const root = repositoryWithLinks();
    const commitSha = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
    const project = path.join(root, 'app');

    const fromCommit = commitSource({ repositoryRoot: root, commitSha, projectRoot: project });
    const fromTree = workingTreeSource(project);

    expect(fromCommit.readMany(['escape.txt', 'inside.txt'])).toEqual(
      new Map([['inside.txt', 'inside']]),
    );
    expect(fromTree.readMany(['escape.txt', 'inside.txt'])).toEqual(
      fromCommit.readMany(['escape.txt', 'inside.txt']),
    );
  });
});
