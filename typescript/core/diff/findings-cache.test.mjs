import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cacheKey,
  createFindingsCache,
  resolveCacheDirectory,
  runBaseWithCache,
} from './findings-cache.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-findings-cache-'));
  temporaryRoots.push(root);
  return root;
}

const analyzer = { name: 'a', version: '1', configurationHash: 'h' };
const key = { mergeBaseSha: 'abc', projectRelativePath: '.', analyzer };
const finding = {
  tool: 'a',
  rule: 'r',
  path: 'x.ts',
  identity: 'i',
  message: 'm',
  classification: 'enforceable',
};

describe('cache key', () => {
  it.each([
    ['merge base', { mergeBaseSha: 'def' }],
    ['project path', { projectRelativePath: 'packages/app' }],
    ['analyzer name', { analyzer: { ...analyzer, name: 'b' } }],
    ['tool version', { analyzer: { ...analyzer, version: '2' } }],
    ['head policy hash', { analyzer: { ...analyzer, configurationHash: 'other' } }],
    ['config overrides', { configOverrides: ['base: "x"'] }],
  ])('changes with the %s', (_label, change) => {
    expect(cacheKey({ ...key, ...change })).not.toBe(cacheKey(key));
  });
});

describe('cache directory', () => {
  it('prefers NITPICKER_CACHE_DIR, then node_modules/.cache/nitpicker, else none', () => {
    const root = temporaryRoot();
    expect(resolveCacheDirectory({ projectRoot: root, environment: {} })).toBeUndefined();
    mkdirSync(path.join(root, 'node_modules'));
    expect(resolveCacheDirectory({ projectRoot: root, environment: {} })).toBe(
      path.join(root, 'node_modules/.cache/nitpicker'),
    );
    expect(
      resolveCacheDirectory({ projectRoot: root, environment: { NITPICKER_CACHE_DIR: 'c' } }),
    ).toBe(path.join(root, 'c'));
  });
});

describe('findings cache', () => {
  it('round-trips a report and treats corrupt entries as misses', () => {
    const directory = path.join(temporaryRoot(), 'cache');
    const cache = createFindingsCache({ directory, mergeBaseSha: 'abc', projectRelativePath: '.' });
    expect(cache.read(analyzer)).toBeUndefined();

    cache.write(analyzer, { findings: [finding] });
    expect(cache.read(analyzer)).toEqual({ findings: [finding] });

    writeFileSync(path.join(directory, readdirSync(directory)[0]), '{not json');
    expect(cache.read(analyzer)).toBeUndefined();
  });

  it('only runs uncached analyzers and their dependencies, and never stores errors', () => {
    const directory = path.join(temporaryRoot(), 'cache');
    const cache = createFindingsCache({ directory, mergeBaseSha: 'abc', projectRelativePath: '.' });
    const cached = { name: 'cached', version: '1', configurationHash: 'h' };
    const fresh = { name: 'fresh', version: '1', configurationHash: 'h', dependencies: ['dep'] };
    const dep = { name: 'dep', version: '1', configurationHash: 'h' };
    const broken = { name: 'broken', version: '1', configurationHash: 'h' };
    const analyzers = [cached, fresh, dep, broken];
    cache.write(cached, { findings: [{ ...finding, tool: 'cached' }] });
    const ran = [];
    const run = (list) => {
      ran.push(list.map(({ name }) => name));
      return {
        reports: new Map(
          list.filter(({ name }) => name !== 'broken').map(({ name }) => [name, { findings: [] }]),
        ),
        timings: new Map(),
        toolErrors: list.some(({ name }) => name === 'broken')
          ? [{ tool: 'broken', snapshot: 'base', message: 'boom' }]
          : [],
      };
    };
    const resolveContext = { liveProjectRoot: '.', policyRoot: '.' };

    const result = runBaseWithCache({ cache, analyzers, run, resolveContext });

    expect(ran).toEqual([['fresh', 'dep', 'broken']]);
    expect(result.reports.get('cached').findings).toHaveLength(1);
    expect(cache.read(fresh)).toEqual({ findings: [] });
    expect(cache.read(broken)).toBeUndefined();

    runBaseWithCache({ cache, analyzers, run, resolveContext });
    expect(ran[1]).toEqual(['broken']);
  });
});
