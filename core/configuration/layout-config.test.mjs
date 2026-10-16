import { describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../../shared/head-policy.mjs';
import { validateConfig } from './validate.mjs';

describe('layout keys', () => {
  it('accepts entry point globs for files that are loaded by path', () => {
    const layout = { entryPoints: ['tools/*-runner.mjs'] };

    expect(validateConfig({ layout })).toEqual({ layout });
  });

  it('accepts the directory roots and the excluded globs together', () => {
    const layout = {
      sourceRoots: ['lib'],
      testRoots: ['spec'],
      excludedGlobs: ['**/vendor/**', '**/*.generated.ts'],
    };

    expect(validateConfig({ layout })).toEqual({ layout });
  });

  it('validates globs for excludedGlobs and directories for the roots', () => {
    expect(() => validateConfig({ layout: { excludedGlobs: ['**/vendor/**'] } })).not.toThrow();
    expect(() => validateConfig({ layout: { sourceRoots: ['**/vendor/**'] } })).toThrow(
      /entries must be directories inside the project/,
    );
    expect(() => validateConfig({ layout: { excludedGlobs: '**/vendor/**' } })).toThrow(
      /"layout.excludedGlobs" must be an array/,
    );
    expect(() => validateConfig({ layout: { excludedGlobs: [''] } })).toThrow(
      /"layout.excludedGlobs" must be an array of non-empty strings/,
    );
  });

  it('lists every allowed layout key when one is unknown', () => {
    expect(() => validateConfig({ layout: { roots: ['lib'] } })).toThrow(
      /Allowed layout keys: sourceRoots, testRoots, excludedGlobs, entryPoints, sharedRoots, featureRoots/,
    );
  });
});

describe('feature layout keys', () => {
  const layout = { sharedRoots: ['**/common'], featureRoots: ['src/main/java/com/acme/features'] };

  it.each([['typescript'], ['javascript'], ['python'], ['java'], ['kotlin']])(
    'are valid with the %s preset and reach the analyzers',
    (preset) => {
      expect(validateConfig({ preset, layout })).toEqual({ preset, layout });
      expect(resolveHeadPolicy({ preset, layout }).layout).toEqual(layout);
    },
  );

  it('accepts an empty feature list, which turns the rule off', () => {
    expect(() => validateConfig({ preset: 'python', layout: { featureRoots: [] } })).not.toThrow();
  });

  it.each([
    [{ sharedRoots: 'shared' }, /"layout.sharedRoots" must be an array/],
    [{ sharedRoots: [''] }, /must be an array of non-empty strings/],
    [{ featureRoots: ['../features'] }, /must be folder globs inside the project/],
    [{ featureRoots: ['/repo/features'] }, /must be folder globs inside the project/],
    [{ sharedRoots: ['C:/shared'] }, /must be folder globs inside the project/],
  ])('rejects %j', (value, message) => {
    expect(() => validateConfig({ preset: 'java', layout: value })).toThrow(message);
  });

  it.each([['python'], ['java'], ['kotlin']])(
    'rejects the TypeScript source folders with the %s preset and names the keys it takes',
    (preset) => {
      expect(() => validateConfig({ preset, layout: { sourceRoots: ['src'] } })).toThrow(
        `"layout.sourceRoots" is not supported with "preset": "${preset}": it describes TypeScript source folders. Layout keys with ${preset}: sharedRoots, featureRoots`,
      );
      expect(() => validateConfig({ preset, layout: { roots: ['src'] } })).toThrow(
        'unknown layout key "roots". Allowed layout keys: sharedRoots, featureRoots',
      );
    },
  );
});
