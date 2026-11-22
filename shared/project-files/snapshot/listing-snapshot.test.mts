import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectFixtures } from '../../../core/diff/git/test-support/projects/project-fixtures.mts';
import { PROJECT_FILES_SNAPSHOT_VARIABLE, withProjectFilesSnapshot } from './listing-snapshot.mts';
import { projectFilePaths, projectFilesUnder } from '../project-files.mts';

const { temporaryRoot, gitProject, tracedGit } = useProjectFixtures();

afterEach(() => {
  vi.unstubAllEnvs();
});

const SOURCES = { 'src/a.mjs': '', 'src/deep/b.mjs': '', 'README.md': '' };

function gitInvocations(logFile: string): string[] {
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((line) => line.includes('built-in: git'));
}

describe('withProjectFilesSnapshot', () => {
  it('serves projectFilePaths and projectFilesUnder without spawning git', async () => {
    const root = gitProject(SOURCES, { ignored: ['scratch/'], tracked: ['README.md'] });
    const logFile = path.join(temporaryRoot(), 'git.log');
    writeFileSync(logFile, '');

    await withProjectFilesSnapshot(root, async (snapshotEnvironment) => {
      const snapshotPath = snapshotEnvironment[PROJECT_FILES_SNAPSHOT_VARIABLE];
      expect(snapshotPath).toBeTruthy();
      expect(existsSync(snapshotPath ?? '')).toBe(true);
      vi.stubEnv(PROJECT_FILES_SNAPSHOT_VARIABLE, snapshotPath ?? '');
      vi.stubEnv('PATH', temporaryRoot());
      tracedGit(logFile);

      expect(projectFilePaths(root)).toEqual(['README.md', 'src/a.mjs', 'src/deep/b.mjs']);
      expect(projectFilePaths(path.join(root, 'src'))).toEqual(['a.mjs', 'deep/b.mjs']);
      expect(projectFilesUnder(path.join(root, 'src'))).toEqual([
        path.join(root, 'src', 'a.mjs'),
        path.join(root, 'src', 'deep', 'b.mjs'),
      ]);
      expect(gitInvocations(logFile)).toEqual([]);
      return Promise.resolve();
    });
  });

  it('falls back to git when querying a different repository than the snapshot', async () => {
    const first = gitProject(SOURCES);
    const second = gitProject({ 'other.mjs': '' });

    await withProjectFilesSnapshot(first, async (snapshotEnvironment) => {
      vi.stubEnv(
        PROJECT_FILES_SNAPSHOT_VARIABLE,
        snapshotEnvironment[PROJECT_FILES_SNAPSHOT_VARIABLE] ?? '',
      );

      expect(projectFilePaths(second)).toEqual(['other.mjs']);
      return Promise.resolve();
    });
  });

  it('passes an empty environment when the directory is not a repository', async () => {
    const plain = temporaryRoot();
    const received = await withProjectFilesSnapshot(plain, async (snapshotEnvironment) =>
      Promise.resolve(snapshotEnvironment),
    );

    expect(received).toEqual({});
  });

  it('removes the temporary snapshot directory on both success and failure', async () => {
    const root = gitProject(SOURCES);
    let successSnapshot = '';
    await withProjectFilesSnapshot(root, async (snapshotEnvironment) => {
      successSnapshot = snapshotEnvironment[PROJECT_FILES_SNAPSHOT_VARIABLE] ?? '';
      return Promise.resolve();
    });
    expect(existsSync(path.dirname(successSnapshot))).toBe(false);

    let failureSnapshot = '';
    await expect(
      withProjectFilesSnapshot(root, async (snapshotEnvironment) => {
        failureSnapshot = snapshotEnvironment[PROJECT_FILES_SNAPSHOT_VARIABLE] ?? '';
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(existsSync(path.dirname(failureSnapshot))).toBe(false);
  });
});
