import { describe, expect, it } from 'vitest';
import { builtInExcludedGlobs } from '../../languages/typescript/preset/layout.mjs';
import { baseConfigCoveringHead } from './base-coverage.mjs';

describe('baseConfigCoveringHead', () => {
  it('keeps a config whose layout and excludes the head does not widen', () => {
    const config = { preset: 'java', exclude: ['build/**'] };

    expect(baseConfigCoveringHead(config, config)).toEqual(config);
    expect(baseConfigCoveringHead({}, {})).toEqual({});
  });

  it('adds the roots the head adds, so the base reads the same folders', () => {
    expect(
      baseConfigCoveringHead(
        { layout: { sourceRoots: ['core'] } },
        { layout: { sourceRoots: ['core', 'shared'], testRoots: ['spec'] } },
      ),
    ).toEqual({
      layout: { sourceRoots: ['core', 'shared'], testRoots: ['test', 'tests', 'spec'] },
    });
  });

  it('keeps only the exclusions and entry points both sides declare', () => {
    expect(
      baseConfigCoveringHead(
        {
          exclude: ['vendor/**', 'legacy/**'],
          layout: { excludedGlobs: ['dist/**', 'gen/**'], entryPoints: ['bin/a.mjs', 'bin/b.mjs'] },
        },
        {
          exclude: ['vendor/**', 'new/**'],
          layout: { excludedGlobs: ['dist/**'], entryPoints: ['bin/a.mjs'] },
        },
      ),
    ).toEqual({
      exclude: ['vendor/**'],
      layout: { excludedGlobs: ['dist/**'], entryPoints: ['bin/a.mjs'] },
    });
  });

  it('narrows the built-in exclusions when the head replaces them with fewer', () => {
    expect(baseConfigCoveringHead({}, { layout: { excludedGlobs: ['dist/**'] } }).layout).toEqual({
      excludedGlobs: builtInExcludedGlobs.filter((glob) => glob === 'dist/**'),
    });
  });
});
