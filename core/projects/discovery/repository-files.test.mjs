import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mts';
import { listRepositoryFiles } from './repository-files.mjs';

const git = useGitFixtures();
const FOLDERS = 60;
const FILES_PER_FOLDER = 1_000;
const LONG_NAME = 'a'.repeat(160);

function writeManyFiles(root) {
  for (const folder of Array.from(
    { length: FOLDERS },
    (_, index) => `packages/p${String(index)}`,
  )) {
    mkdirSync(path.join(root, folder), { recursive: true });
    for (const index of Array.from({ length: FILES_PER_FOLDER }, (_, file) => file)) {
      writeFileSync(path.join(root, folder, `${LONG_NAME}-${String(index)}.ts`), '');
    }
  }
}

describe('listRepositoryFiles', () => {
  it('lists a repository whose file list is larger than 10 MB', () => {
    const { root } = git.createGitRepository(
      { 'package.json': '{}' },
      { prefix: 'nitpicker-big-' },
    );
    writeManyFiles(root);

    const files = listRepositoryFiles(root);

    expect(files).toHaveLength(FOLDERS * FILES_PER_FOLDER + 1);
    expect(files.join('\0').length).toBeGreaterThan(10 * 1024 * 1024);
  });
});
