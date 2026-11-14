import { describe, expect, it } from 'vitest';
import {
  mergeMetadata,
  recoverAnalyzerVersion,
  resolveAnalyzerMetadata,
  resolvedAnalyzerMetadata,
} from './analyzer-metadata.mts';

const context = { liveProjectRoot: '/live', policyRoot: '/policy' };

function analyzer(overrides: object = {}) {
  return {
    name: 'tool',
    version: 'unresolved',
    configurationHash: 'static',
    resolveVersion: (root: unknown) => `v:${String(root)}`,
    resolveConfigurationHash: (root: unknown) => `h:${String(root)}`,
    ...overrides,
  };
}

describe('resolveAnalyzerMetadata', () => {
  it('returns the resolved values and leaves the analyzer untouched', () => {
    const tool = analyzer();

    const resolution = resolveAnalyzerMetadata(tool, context);

    expect(resolution).toEqual({
      kind: 'resolved',
      metadata: { version: 'v:/live', configurationHash: 'h:/policy' },
    });
    expect([tool.version, tool.configurationHash]).toEqual(['unresolved', 'static']);
  });

  it('keeps a version resolved before the configuration hash threw', () => {
    const failure = new Error('no config');
    const tool = analyzer({
      resolveConfigurationHash: () => {
        throw failure;
      },
    });

    const resolution = resolveAnalyzerMetadata(tool, context);

    expect(resolution).toEqual({
      kind: 'failed',
      metadata: { version: 'v:/live' },
      error: failure,
    });
    expect(() => resolvedAnalyzerMetadata(tool, context)).toThrow('no config');
  });

  it('keeps earlier values that a later resolution does not replace', () => {
    const tool = analyzer({ resolveConfigurationHash: undefined });

    const resolution = resolveAnalyzerMetadata(tool, context, { configurationHash: 'earlier' });

    expect(resolution.metadata).toEqual({ version: 'v:/live', configurationHash: 'earlier' });
  });

  it('resolves nothing for a value that is not an object', () => {
    expect(resolveAnalyzerMetadata('tool', context)).toEqual({ kind: 'resolved', metadata: {} });
  });
});

describe('recoverAnalyzerVersion', () => {
  it('marks a version that never resolved as unknown', () => {
    expect(recoverAnalyzerVersion(analyzer(), undefined)).toEqual({
      version: 'unknown',
      versionRecovered: true,
    });
  });

  it('leaves a resolved version and an analyzer without a resolver alone', () => {
    const resolved = { version: 'v1' };

    expect(recoverAnalyzerVersion(analyzer(), resolved)).toBe(resolved);
    expect(recoverAnalyzerVersion(analyzer({ resolveVersion: undefined }), undefined)).toBe(
      undefined,
    );
  });
});

describe('mergeMetadata', () => {
  it('lets the later map win per analyzer and per field', () => {
    const tool = analyzer();
    const base = new Map([[tool, { version: 'base', configurationHash: 'base' }]]);
    const head = new Map([[tool, { version: 'head' }]]);

    expect(mergeMetadata(base, head, undefined).get(tool)).toEqual({
      version: 'head',
      configurationHash: 'base',
    });
  });
});
