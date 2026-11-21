import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mts';
import { isSkippedLocation, listRepositoryFiles } from './repository-files.mts';

const git = useGitFixtures();
const FOLDERS = 60;
const FILES_PER_FOLDER = 1_000;
const LONG_NAME = 'a'.repeat(160);

function writeManyFiles(root: string): void {
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

describe('isSkippedLocation', () => {
  it.each([
    'testdata/sample',
    '__fixtures__/sample',
    '__tests__/sample',
    'testFixtures/sample',
    'src/test',
    'src/tests/sample',
    'src/testFixtures/sample',
    'src/dockerTest/projects/a',
    'mod/src/intTest/projects/b',
    'mod/src/functionalTest/projects/c',
    'mod/src/integrationTests/projects/d',
    'src/main/resources/template',
    'mod/src/custom/resources/project',
  ])('skips %s', (directory) => {
    expect(isSkippedLocation(directory)).toBe(true);
  });

  it.each([
    '.',
    'src',
    'src/main',
    'src/main/java',
    'services/contest',
    'services/testRunner',
    'build-logic/src/main/kotlin',
  ])('keeps %s', (directory) => {
    expect(isSkippedLocation(directory)).toBe(false);
  });
});
