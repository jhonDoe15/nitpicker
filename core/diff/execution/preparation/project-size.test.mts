import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../git/test-support/git-repository.mts';
import { writeFiles } from '../../git/test-support/fixture-files.mts';
import { prepareTask } from './prepare-task.mts';
import {
  deadlineScaleOf,
  memoizedFileCounter,
  memoryEstimateMegabytes,
  projectFileCount,
  scaledDeadlineMs,
} from './project-size.mts';

const MINUTE_MS = 60_000;
const SCALE = { perThousandFilesMs: 2 * MINUTE_MS, extensions: ['ts', 'tsx'] };
const STEP = { perThousandFiles: 2 * MINUTE_MS, extensions: ['ts'] };
const git = useGitFixtures();

function sources(count: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`src/m${String(index)}.ts`, '']),
  );
}

function analyzer(extra: object) {
  return {
    name: 'structure',
    version: '1',
    configurationHash: 'hash',
    exclusions: [],
    timeoutMs: 5 * MINUTE_MS,
    timeoutScale: SCALE,
    createInvocation: () => ({ command: 'node', args: [] }),
    ...extra,
  };
}

function contextFor(liveProjectRoot: string) {
  return {
    projectRoot: liveProjectRoot,
    policyRoot: liveProjectRoot,
    toolRoot: liveProjectRoot,
    snapshot: 'head',
    baselineRoot: undefined,
    baselineMovesFile: undefined,
    liveProjectRoot,
    mutationScope: undefined,
    logRoot: undefined,
  };
}

function preparedTimeout(source: object, liveProjectRoot: string): number | undefined {
  const preparation = prepareTask(source, contextFor(liveProjectRoot), undefined);
  return preparation.kind === 'ready' ? preparation.task.timeoutMs : undefined;
}

function preparedMemory(source: object, liveProjectRoot: string): number | undefined {
  const preparation = prepareTask(source, contextFor(liveProjectRoot), undefined);
  return preparation.kind === 'ready' ? preparation.task.memoryMegabytes : undefined;
}

describe('analyzer budgets scaled with project size', () => {
  it('adds the per-thousand allowance for each started thousand source files', () => {
    expect(scaledDeadlineMs(5 * MINUTE_MS, STEP, 0)).toBe(5 * MINUTE_MS);
    expect(scaledDeadlineMs(5 * MINUTE_MS, STEP, 1)).toBe(7 * MINUTE_MS);
    expect(scaledDeadlineMs(5 * MINUTE_MS, STEP, 10_000)).toBe(25 * MINUTE_MS);
  });

  it('counts only the listed extensions, tracked or not, outside ignored folders', () => {
    const { root } = git.createGitRepository(
      { ...sources(3), 'src/view.tsx': '', 'README.md': '', '.gitignore': 'dist/\n' },
      { prefix: 'nitpicker-deadline-' },
    );
    writeFiles(root, { 'src/new.ts': '', 'dist/out.ts': '' });

    expect(projectFileCount(root, ['ts', 'tsx'])).toBe(5);
  });

  it('lists a project once per preparation', () => {
    const { root } = git.createGitRepository(sources(2), { prefix: 'nitpicker-deadline-' });
    const countFiles = memoizedFileCounter();

    expect(countFiles(root, ['ts'])).toBe(2);
    writeFiles(root, { 'src/later.ts': '' });
    expect(countFiles(root, ['ts'])).toBe(2);
    expect(memoizedFileCounter()(root, ['ts'])).toBe(3);
  });

  it('gives a scaled analyzer more time on a larger project', () => {
    const { root } = git.createGitRepository(sources(1_001), { prefix: 'nitpicker-deadline-' });

    expect(preparedTimeout(analyzer({}), root)).toBe(9 * MINUTE_MS);
  });

  it('keeps a configured timeout and an unscaled analyzer as they are', () => {
    const { root } = git.createGitRepository(sources(2), { prefix: 'nitpicker-deadline-' });

    expect(preparedTimeout(analyzer({ timeoutMs: MINUTE_MS, configuredTimeout: true }), root)).toBe(
      MINUTE_MS,
    );
    expect(preparedTimeout(analyzer({ timeoutScale: undefined }), root)).toBe(5 * MINUTE_MS);
    expect(deadlineScaleOf({ timeoutScale: { perThousandFilesMs: 0 } })).toBeUndefined();
  });

  it('estimates an analyzer peak memory from the number of source files', () => {
    const { root } = git.createGitRepository(sources(1_500), { prefix: 'nitpicker-memory-' });
    const memoryScale = { perThousandFilesMegabytes: 600, extensions: ['ts'] };

    expect(memoryEstimateMegabytes({ memoryScale }, root)).toBe(900);
    expect(memoryEstimateMegabytes({}, root)).toBe(0);
    expect(preparedMemory(analyzer({ memoryScale }), root)).toBe(900);
  });
});
