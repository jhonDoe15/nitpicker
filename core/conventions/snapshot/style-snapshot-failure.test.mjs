import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { lazyConfigRoot } from '../style-snapshot.mjs';

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    writeFileSync: (file, ...rest) => {
      if (String(file).includes('nitpicker-style-') && String(file).endsWith('broken.toml')) {
        throw new Error('disk exploded');
      }
      return original.writeFileSync(file, ...rest);
    },
  };
});

const { createGitRepository } = useGitFixtures();

function leftovers() {
  return readdirSync(path.resolve(tmpdir())).filter((name) => name.startsWith('nitpicker-style-'));
}

describe('a copy of the merge base that fails half way', () => {
  it('removes its temporary directory and reports the failure', () => {
    const failing = createGitRepository({ 'broken.toml': 'x = 1\n' });
    const failingSha = fixtureGit(failing.root, ['rev-parse', 'HEAD']).trim();
    const before = leftovers();
    const snapshot = lazyConfigRoot({
      projectRoot: failing.root,
      commit: () => ({ repositoryRoot: failing.root, commitSha: failingSha }),
      useBase: () => true,
      named: ['broken.toml'],
    });

    expect(() => snapshot.get()).toThrow('disk exploded');
    expect(leftovers()).toEqual(before);
  });
});
