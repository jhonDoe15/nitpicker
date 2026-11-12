import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { lazyConfigRoot } from '../style-snapshot.mjs';

const created = vi.hoisted(() => []);

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    mkdtempSync: (prefix, ...rest) => {
      const directory = original.mkdtempSync(prefix, ...rest);
      created.push(directory);
      return directory;
    },
    writeFileSync: (file, ...rest) => {
      if (String(file).includes('nitpicker-style-') && String(file).endsWith('broken.toml')) {
        throw new Error('disk exploded');
      }
      return original.writeFileSync(file, ...rest);
    },
  };
});

const { createGitRepository } = useGitFixtures();

describe('a copy of the merge base that fails half way', () => {
  it('removes its temporary directory and reports the failure', () => {
    const failing = createGitRepository({ 'broken.toml': 'x = 1\n' });
    const failingSha = fixtureGit(failing.root, ['rev-parse', 'HEAD']).trim();
    created.length = 0;
    const snapshot = lazyConfigRoot({
      projectRoot: failing.root,
      commit: () => ({ repositoryRoot: failing.root, commitSha: failingSha }),
      useBase: () => true,
      named: ['broken.toml'],
    });

    expect(() => snapshot.get()).toThrow('disk exploded');
    const snapshots = created.filter((directory) => directory.includes('nitpicker-style-'));
    expect(snapshots).toHaveLength(1);
    expect(snapshots.filter((directory) => existsSync(directory))).toEqual([]);
  });
});
