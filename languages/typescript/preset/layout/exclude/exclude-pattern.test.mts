import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { EXCLUDED_PATH_PATTERN, resolveLayout } from '../../layout.mts';
import { excludePatternFor } from './exclude-pattern.mts';

const require = createRequire(import.meta.url);

function isSafeRegex(pattern: string): boolean {
  const check: unknown = require('safe-regex');
  if (typeof check !== 'function') {
    throw new TypeError('safe-regex did not export a function');
  }
  return Boolean(check(pattern));
}

describe('excludePatternFor', () => {
  it('produces a safe-regex pattern for sourceRoots: ["."] and matches excluded root paths', () => {
    const { excludePattern } = resolveLayout({ sourceRoots: ['.'] });
    expect(excludePattern).toBeDefined();
    const combined = [EXCLUDED_PATH_PATTERN, excludePattern]
      .filter((pattern) => pattern !== undefined)
      .join('|');
    expect(isSafeRegex(excludePattern ?? '')).toBe(true);
    expect(isSafeRegex(combined)).toBe(true);

    const matcher = new RegExp(combined, 'u');
    for (const excluded of [
      'dist/index.js',
      'build/app.js',
      'node_modules/pkg/index.js',
      'packages/a/node_modules/pkg/index.js',
      '.git/config',
      '.cache/file.ts',
      'sub/.hidden/file.ts',
      'vite.config.ts',
      'babel.config.js',
      'jest.setup.ts',
      'examples/demo.ts',
      'docs/intro.ts',
      'out/bundle.js',
    ]) {
      expect(matcher.test(excluded), excluded).toBe(true);
    }
    for (const kept of ['index.ts', 'views/home.tsx', 'components/Button.tsx', 'app/utils.ts']) {
      expect(matcher.test(kept), kept).toBe(false);
    }
  });

  it('stays safe-regex even with many additional exclude globs under sourceRoots: ["."]', () => {
    const extra = Array.from({ length: 30 }, (_, index) => `vendor/pkg-${String(index)}/**`);
    const { excludePattern } = resolveLayout({ sourceRoots: ['.'] }, extra);
    const combined = [EXCLUDED_PATH_PATTERN, excludePattern]
      .filter((pattern) => pattern !== undefined)
      .join('|');
    expect(isSafeRegex(combined)).toBe(true);
    expect(new RegExp(combined, 'u').test('vendor/pkg-29/index.ts')).toBe(true);
    expect(new RegExp(combined, 'u').test('app/live.ts')).toBe(false);
  });

  it('returns undefined when no globs are given', () => {
    expect(excludePatternFor([])).toBeUndefined();
  });
});
