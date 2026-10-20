import { describe, expect, it } from 'vitest';
import { validateConfig } from '../validate.mjs';

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
      /Allowed layout keys: sourceRoots, testRoots, excludedGlobs/,
    );
  });
});
