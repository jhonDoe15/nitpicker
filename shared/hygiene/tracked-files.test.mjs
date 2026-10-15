import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  fixtureGit,
  removeGitRepositories,
} from '../../core/diff/fixtures/git-repository.mjs';
import { fileSize, trackedFiles } from './tracked-files.mjs';

afterEach(removeGitRepositories);

describe('trackedFiles', () => {
  it('lists tracked files relative to the folder, with odd names intact', () => {
    const { root } = createGitRepository({
      'src/a.ts': 'a',
      'docs/with space.md': 'b',
      'docs/ünï.md': 'c',
      'packages/web/package.json': '{}',
    });
    writeFileSync(path.join(root, 'untracked.txt'), 'x');

    expect(trackedFiles(root).toSorted()).toEqual([
      'docs/with space.md',
      'docs/ünï.md',
      'packages/web/package.json',
      'src/a.ts',
    ]);
    expect(trackedFiles(path.join(root, 'packages/web'))).toEqual(['package.json']);
  });
});

describe('fileSize', () => {
  it('measures a regular file and ignores links, folders and missing files', () => {
    const { root } = createGitRepository({ 'a.txt': '12345' });
    mkdirSync(path.join(root, 'folder'));
    symlinkSync('a.txt', path.join(root, 'link.txt'));
    fixtureGit(root, ['add', '-A']);

    expect(fileSize(root, 'a.txt')).toBe(5);
    expect(fileSize(root, 'link.txt')).toBeUndefined();
    expect(fileSize(root, 'folder')).toBeUndefined();
    expect(fileSize(root, 'missing.txt')).toBeUndefined();
  });
});
