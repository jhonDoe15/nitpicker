import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createResumeCache, finishResume, resumeDirectory } from './resume-cache.mts';
import { createDirectoryStore } from '../cache-stores.mts';
import { useGitFixtures } from '../../git/test-support/git-repository.mts';

const fixtures = useGitFixtures();
const analyzer = { name: 'a', version: '1', configurationHash: 'h' };

function placeIn(directory: string | undefined, treeKey = 'abc:head-tree:1') {
  const cacheStore =
    directory === undefined ? undefined : { ...createDirectoryStore(directory), directory };
  return {
    cacheStore,
    kind: 'head' as const,
    projectRelativePath: 'packages/app',
    treeKey,
    analyzers: [analyzer],
  };
}

function resumeIn(directory: string | undefined, treeKey = 'abc:head-tree:1') {
  return createResumeCache({ ...placeIn(directory, treeKey), configOverrides: [], headPolicy: {} });
}

function savedCheckpoint(directory: string): string {
  const file = resumeIn(directory)?.cache.checkpointOf?.(analyzer)?.file ?? '';
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '{}');
  return file;
}

describe('the resume folder', () => {
  it('lives in the local findings cache, apart per project and run kind', () => {
    const directory = fixtures.temporaryRoot('nitpicker-resume-');
    const head = resumeIn(directory);
    const snapshot = createResumeCache({
      ...placeIn(directory),
      kind: 'snapshot',
      treeKey: 'snapshot-tree:1',
      configOverrides: [],
      headPolicy: {},
    });

    expect(path.dirname(head?.directory ?? '')).toBe(path.join(directory, 'resume'));
    expect(head?.directory).not.toBe(snapshot?.directory);
    expect(path.dirname(head?.cache.checkpointOf?.(analyzer)?.file ?? '')).toBe(head?.directory);
    expect(resumeIn(undefined)).toBeUndefined();
  });

  it('keys its entries by the checked tree, so changed code never resumes', () => {
    const directory = fixtures.temporaryRoot('nitpicker-resume-');

    const first = resumeIn(directory)?.cache.checkpointOf?.(analyzer)?.key;
    const edited = resumeIn(directory, 'abc:head-tree:2')?.cache.checkpointOf?.(analyzer)?.key;

    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(edited).not.toBe(first);
  });

  it('gives another tree or another analyzer selection a folder of its own', () => {
    const directory = fixtures.temporaryRoot('nitpicker-resume-');
    const first = resumeDirectory(placeIn(directory));

    expect(resumeDirectory(placeIn(directory, 'abc:head-tree:2'))).not.toBe(first);
    expect(resumeDirectory({ ...placeIn(directory), analyzers: [{ name: 'b' }] })).not.toBe(first);
    expect(resumeDirectory({ ...placeIn(directory), analyzers: [analyzer] })).toBe(first);
  });

  it('is cleared when a run finishes, and kept when the analyzer scheduler stopped', () => {
    const directory = fixtures.temporaryRoot('nitpicker-resume-');
    const file = savedCheckpoint(directory);

    const folder = resumeDirectory(placeIn(directory));
    finishResume(folder, [{ tool: 'analyzer-scheduler', message: 'crashed' }]);
    const keptAfterStop = existsSync(file);
    finishResume(folder, [{ tool: 'eslint', message: 'failed' }]);

    expect(keptAfterStop).toBe(true);
    expect(existsSync(file)).toBe(false);
  });
});
