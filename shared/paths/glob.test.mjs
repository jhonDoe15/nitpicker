import { describe, expect, it } from 'vitest';
import { globMatcher, globToRegExpSource } from './glob.mjs';

const CASES = [
  {
    glob: '**/*.test.{ts,tsx}',
    matching: ['a/b.test.ts', 'b.test.tsx'],
    other: ['a/b.test.js', 'a/btest.ts'],
  },
  {
    glob: 'src/**/shared',
    matching: ['src/shared', 'src/a/b/shared'],
    other: ['src/shared/x', 'lib/shared'],
  },
  { glob: 'src/**', matching: ['src/a', 'src/a/b'], other: ['srcx/a', 'lib/src/a'] },
  { glob: 'a/*/c', matching: ['a/b/c'], other: ['a/b/x/c', 'a/c'] },
  { glob: 'a?c', matching: ['abc'], other: ['a/c', 'ac'] },
  { glob: '{a,{b,c}}/x', matching: ['a/x', 'c/x'], other: ['d/x'] },
  { glob: 'a}b,c', matching: ['a}b,c'], other: ['ab'] },
  { glob: 'src/app/[id]/**', matching: ['src/app/[id]/page.tsx'], other: ['src/app/i/page.tsx'] },
  { glob: '$x.(1)', matching: ['$x.(1)'], other: ['ax.(1)'] },
  {
    glob: String.raw`src/app/\[id\]/*.tsx`,
    matching: ['src/app/[id]/page.tsx'],
    other: ['src/app/i/page.tsx'],
  },
  { glob: String.raw`a\*b\{c\,d\}`, matching: ['a*b{c,d}'], other: ['axb{c,d}', 'a*bc'] },
  {
    glob: 'tests/**/*legacy*',
    matching: ['tests/legacy.ts', 'tests/unit/old-legacy.test.ts'],
    other: ['tests/current.ts', 'src/legacy.ts'],
  },
  {
    glob: 'src/**/legacy.ts',
    matching: ['src/legacy.ts', 'src/a/b/legacy.ts'],
    other: ['src/current.ts', 'src/legacy.tsx', 'other/src/legacy.ts'],
  },
  {
    glob: 'src/**/test/**/legacy.{ts,js}',
    matching: ['src/test/legacy.ts', 'src/a/test/b/legacy.js'],
    other: ['src/test/legacy.tsx', 'src/a/legacy.ts'],
  },
];

describe('globMatcher', () => {
  it.each(CASES)(
    'matches $glob like its regular expression source',
    ({ glob, matching, other }) => {
      const pattern = new RegExp(globToRegExpSource(glob));
      const matcher = globMatcher(glob);
      const paths = matching.concat(other);

      expect(paths.map((path) => matcher.test(path))).toEqual(
        paths.map((path) => pattern.test(path)),
      );
      expect(matching.map((path) => matcher.test(path))).toEqual(matching.map(() => true));
      expect(other.map((path) => matcher.test(path))).toEqual(other.map(() => false));
    },
  );

  it('is linear in the path however many ** segments the glob has', () => {
    const glob = `${Array.from({ length: 10 }, () => '**/d').join('/')}/x`;
    const path = `${'d/'.repeat(30)}y`;
    const started = performance.now();

    expect(globMatcher(glob).test(path)).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('fails on a brace that is never closed', () => {
    expect(() => globMatcher('src/{a,b')).toThrow(
      new SyntaxError('Invalid glob "src/{a,b": a "{" is never closed'),
    );
  });
});
