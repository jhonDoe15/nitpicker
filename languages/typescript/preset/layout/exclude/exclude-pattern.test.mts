import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { globToRegExpSource } from '../../../../../shared/paths/glob.mts';
import { EXCLUDED_PATH_PATTERN, resolveLayout } from '../../layout.mts';
import { excludePatternOf } from './exclude-pattern.mts';

const fromCruiser = createRequire(import.meta.resolve('dependency-cruiser'));
const loadedSafeRegex: unknown = fromCruiser('safe-regex');

function safeRegex(pattern: string): boolean {
  return (
    typeof loadedSafeRegex === 'function' &&
    Reflect.apply(loadedSafeRegex, undefined, [pattern]) === true
  );
}

const USER_GLOBS = [
  ...Array.from({ length: 30 }, (_, index) => `**/*.s${String(index)}.tsx`),
  '*.config.js',
  '**/setup-tests.ts',
  'scripts/**',
  'src/**/*.gen.ts',
  '**/__fixtures__/**',
];

const PATHS = [
  'dist/a.js',
  'src/dist/a.js',
  'reports/quality/x.json',
  'reports/other.json',
  'node_modules/x/index.js',
  'packages/a/node_modules/x/index.js',
  '.cache/a.ts',
  'src/.hidden/a.ts',
  'src/types.d.ts',
  'vitest.config.ts',
  'src/vitest.config.ts',
  'index.tsx',
  'components/button.tsx',
  'docs-site/page.ts',
  'buildtools/a.ts',
  'src/a.s7.tsx',
  'a.s29.tsx',
  'src/a.s7.ts',
  'a.config.js',
  'src/a.config.js',
  'setup-tests.ts',
  'src/setup-tests.ts',
  'src/x-setup-tests.ts',
  'scripts/a.ts',
  'src/scripts/a.ts',
  'src/deep/a.gen.ts',
  'lib/a.gen.ts',
  'src/__fixtures__/a.ts',
];

function cliPattern(pattern: string): string {
  return `${EXCLUDED_PATH_PATTERN}|${pattern}`;
}

describe('exclude pattern of hidden globs', () => {
  it.each([
    ['the package-root layout', []],
    ['the package-root layout with many user excludes', USER_GLOBS],
  ])('matches the same paths as one alternative per glob for %s', (_, exclude) => {
    const globs = resolveLayout({ sourceRoots: ['.'] }, exclude).hiddenGlobs;
    const folded = new RegExp(excludePatternOf(globs) ?? '', 'u');
    const perGlob = new RegExp(globs.map((glob) => globToRegExpSource(glob)).join('|'), 'u');
    expect(PATHS.map((path) => [path, folded.test(path)])).toEqual(
      PATHS.map((path) => [path, perGlob.test(path)]),
    );
  });

  it.each([
    ['the package-root layout', []],
    ['the package-root layout with many user excludes', USER_GLOBS],
  ])('passes the dependency-cruiser safe-regex check for %s', (_, exclude) => {
    const { hiddenGlobs, excludePattern } = resolveLayout({ sourceRoots: ['.'] }, exclude);
    const perGlob = hiddenGlobs.map((glob) => globToRegExpSource(glob)).join('|');
    expect(safeRegex(cliPattern(perGlob))).toBe(false);
    expect(safeRegex(cliPattern(excludePattern ?? ''))).toBe(true);
  });

  it('gives no pattern for no globs and escapes folder names', () => {
    expect(excludePatternOf([])).toBeUndefined();
    expect(excludePatternOf(['a.b/**'])).toBe('^(?:a\\.b)/');
    expect(excludePatternOf(['**/*.a.ts', '**/*.b.ts'])).toBe(
      '(?:^|/)[^/]*(?:\\.a\\.ts|\\.b\\.ts)$',
    );
  });
});
