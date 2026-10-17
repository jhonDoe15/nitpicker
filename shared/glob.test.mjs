import { describe, expect, it } from 'vitest';
import { globMatcher, globToRegExpSource } from './glob.mjs';

const CASES = [
  ['**/*.test.{ts,tsx}', ['a/b.test.ts', 'b.test.tsx'], ['a/b.test.js', 'a/btest.ts']],
  ['src/**/shared', ['src/shared', 'src/a/b/shared'], ['src/shared/x', 'lib/shared']],
  ['src/**', ['src/a', 'src/a/b'], ['srcx/a', 'lib/src/a']],
  ['a/*/c', ['a/b/c'], ['a/b/x/c', 'a/c']],
  ['a?c', ['abc'], ['a/c', 'ac']],
  ['{a,{b,c}}/x', ['a/x', 'c/x'], ['d/x']],
  ['a}b,c', ['a}b,c'], ['ab']],
  ['$x.(1)', ['$x.(1)'], ['ax.(1)']],
];

describe('globMatcher', () => {
  it.each(CASES)('matches %s like its regular expression source', (glob, matching, other) => {
    const pattern = new RegExp(globToRegExpSource(glob));
    const matcher = globMatcher(glob);

    expect([...matching, ...other].map((path) => matcher.test(path))).toEqual(
      [...matching, ...other].map((path) => pattern.test(path)),
    );
    expect(matching.map((path) => matcher.test(path))).toEqual(matching.map(() => true));
  });

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
