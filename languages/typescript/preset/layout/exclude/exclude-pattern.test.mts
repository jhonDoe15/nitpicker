import { describe, expect, it } from 'vitest';
import { globToRegExpSource } from '../../../../../shared/paths/glob.mts';
import { excludePatternOf } from './exclude-pattern.mts';

const ROOT_LAYOUT_GLOBS = [
  'dist/**',
  'build/**',
  'reports/quality/**',
  '.git/**',
  'storybook-static/**',
  'examples/**',
  'docs/**',
  'tmp/**',
  'temp/**',
  'bench/**',
  'benchmarks/**',
  'coverage/**',
  'generated/**',
  'target/**',
  'out/**',
  'public/**',
  '**/node_modules/**',
  '**/.*/**',
  '**/*.d.ts',
  'vitest*.ts',
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
];

const MAX_SAFE_REPETITIONS = 25;

function repetitionsOf(pattern: string): number {
  return (pattern.replaceAll(/\\./gu, '').match(/[*+?]|\{\d/gu) ?? []).length;
}

describe('exclude pattern of hidden globs', () => {
  it('matches the same paths as one alternative per glob', () => {
    const folded = new RegExp(excludePatternOf(ROOT_LAYOUT_GLOBS) ?? '', 'u');
    const perGlob = new RegExp(ROOT_LAYOUT_GLOBS.map((glob) => globToRegExpSource(glob)).join('|'), 'u');
    for (const path of PATHS) expect([path, folded.test(path)]).toEqual([path, perGlob.test(path)]);
  });

  it('stays under the repetition limit of the dependency-cruiser safe-regex check', () => {
    const perGlob = ROOT_LAYOUT_GLOBS.map((glob) => globToRegExpSource(glob)).join('|');
    expect(repetitionsOf(perGlob)).toBeGreaterThan(MAX_SAFE_REPETITIONS);
    expect(repetitionsOf(excludePatternOf(ROOT_LAYOUT_GLOBS) ?? '')).toBeLessThanOrEqual(MAX_SAFE_REPETITIONS);
  });

  it('gives no pattern for no globs and escapes folder names', () => {
    expect(excludePatternOf([])).toBeUndefined();
    expect(excludePatternOf(['a.b/**'])).toBe('^(?:a\\.b)/');
  });
});
