import { describe, expect, it } from 'vitest';
import { globToRegExp } from '../glob.mjs';

describe('directory globstars', () => {
  it.each([
    [
      'tests/**/*legacy*',
      ['tests/legacy.ts', 'tests/unit/old-legacy.test.ts'],
      ['tests/current.ts', 'src/legacy.ts'],
    ],
    [
      '**/*.test.ts',
      ['unit.test.ts', 'tests/unit.test.ts', 'tests/unit/deep.test.ts'],
      ['unit.spec.ts', 'unit.test.tsx'],
    ],
    [
      'src/**/legacy.ts',
      ['src/legacy.ts', 'src/a/b/legacy.ts'],
      ['src/current.ts', 'src/legacy.tsx', 'other/src/legacy.ts'],
    ],
    [
      'src/**/test/**/legacy.{ts,js}',
      ['src/test/legacy.ts', 'src/a/test/b/legacy.js'],
      ['src/test/legacy.tsx', 'src/a/legacy.ts'],
    ],
    [
      'src/legacy/**',
      ['src/legacy/a.ts', 'src/legacy/a/b.ts'],
      ['src/legacy.ts', 'src/current/a.ts'],
    ],
  ])('matches only the intended paths for %s', (glob, matching, other) => {
    const matcher = globToRegExp(glob);

    for (const file of matching) expect(matcher.test(file), file).toBe(true);
    for (const file of other) expect(matcher.test(file), file).toBe(false);
  });
});
