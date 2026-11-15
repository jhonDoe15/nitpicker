import { describe, expect, it } from 'vitest';
import { runAnalyzers } from './run-analyzers.mts';
import { mergeMetadata, metadataValue } from './report/analyzer-metadata.mts';
import { createFindingsCache, runBaseWithCache } from '../cache/findings-cache.mts';

const noTasks = () => ({ reports: [], errors: [], skipped: [], timings: [] });

function request(analyzers: unknown[], snapshot: string) {
  return {
    analyzers,
    projectRoot: '/project',
    policyRoot: '/project',
    toolRoot: '/tool',
    snapshot,
    baselineRoot: undefined,
    baselineMovesFile: undefined,
    liveProjectRoot: '/project',
    headPolicyFile: undefined,
    mutationScope: undefined,
    logRoot: undefined,
    runTasks: noTasks,
  };
}

function analyzer(overrides: object = {}) {
  return {
    name: 'tool',
    version: 'unresolved',
    configurationHash: 'h1',
    exclusions: [],
    createInvocation: () => ({ command: 'node', args: [] }),
    ...overrides,
  };
}

function flaky() {
  let calls = 0;
  return analyzer({
    resolveVersion: () => {
      calls += 1;
      if (calls > 1) {
        throw new Error('second resolution fails');
      }
      return 'v1';
    },
  });
}

describe('metadata carried through analyzer runs', () => {
  it('keeps a version resolved by an earlier run when a later run cannot resolve it', () => {
    const tool = flaky();

    const base = runAnalyzers(request([tool], 'base'));
    const head = runAnalyzers(request([tool], 'head'));

    expect(head.toolErrors.map((error) => error.message)).toEqual(['second resolution fails']);
    expect(mergeMetadata(base.metadata, head.metadata).get(tool)?.version).toBe('v1');
  });

  it('marks a version that never resolved as unknown', () => {
    const tool = analyzer({
      resolveVersion: () => {
        throw new Error('no version');
      },
    });

    const run = runAnalyzers(request([tool], 'head'));

    expect(metadataValue(tool, 'version', run.metadata.get(tool))).toBe('unknown');
    expect(tool.version).toBe('unresolved');
  });

  it('validates the resolved version, not the placeholder', () => {
    const empty = analyzer({ resolveVersion: () => '' });
    const late = analyzer({ version: undefined, resolveVersion: () => '1.0' });

    const emptyRun = runAnalyzers(request([empty], 'head'));
    const lateRun = runAnalyzers(request([late], 'head'));

    expect(emptyRun.toolErrors.map((error) => error.message)).toEqual([
      'Analyzer version must be a non-empty string',
    ]);
    expect(lateRun.toolErrors).toEqual([]);
  });

  it('keeps the resolved version when a cached run cannot resolve it again', () => {
    const tool = flaky();
    const cache = createFindingsCache({
      store: undefined,
      directory: undefined,
      mergeBaseSha: 'sha',
      projectRelativePath: '.',
    });

    const result = runBaseWithCache({
      cache,
      analyzers: [tool],
      resolveContext: { liveProjectRoot: '/project', policyRoot: '/project' },
      run: (analyzers) => runAnalyzers(request([...analyzers], 'base')),
    });

    expect(result.metadata.get(tool)?.version).toBe('v1');
  });

  it('keeps a version resolved before the configuration hash threw in a cache lookup', () => {
    const tool = analyzer({
      resolveConfigurationHash: () => {
        throw new Error('no config');
      },
      resolveVersion: () => 'v1',
    });
    const cache = createFindingsCache({
      store: undefined,
      directory: undefined,
      mergeBaseSha: 'sha',
      projectRelativePath: '.',
    });

    const result = runBaseWithCache({
      cache,
      analyzers: [tool],
      resolveContext: { liveProjectRoot: '/project', policyRoot: '/project' },
      run: () => ({ reports: new Map(), timings: new Map(), toolErrors: [] }),
    });

    expect(result.metadata.get(tool)).toEqual({ version: 'v1' });
  });
});
