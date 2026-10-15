import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  fixtureGit,
  removeGitRepositories,
} from '../../core/diff/fixtures/git-repository.mjs';
import { committedSizes, trackedFiles } from './tracked-files.mjs';

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

describe('committedSizes', () => {
  it('sizes the committed blob of each regular file, not the working tree copy', () => {
    const { root } = createGitRepository({ 'a.txt': '12345', 'pointer.psd': 'oid sha256:1\n' });
    writeFileSync(path.join(root, 'tool.sh'), 'echo\n', { mode: 0o755 });
    symlinkSync('a.txt', path.join(root, 'link.txt'));
    mkdirSync(path.join(root, 'folder'));
    writeFileSync(path.join(root, 'folder/b.txt'), '1');
    fixtureGit(root, ['add', '-A']);
    writeFileSync(path.join(root, 'pointer.psd'), 'x'.repeat(4096));

    expect(committedSizes(root)).toEqual(
      new Map([
        ['a.txt', 5],
        ['folder/b.txt', 1],
        ['pointer.psd', 13],
        ['tool.sh', 5],
      ]),
    );
  });

  it('returns nothing for an empty repository', () => {
    const { root } = createGitRepository({});

    expect(committedSizes(root)).toEqual(new Map());
  });
});
