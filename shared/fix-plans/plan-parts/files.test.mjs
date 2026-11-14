import { describe, expect, it } from 'vitest';
import { nearestTestFile, subjectOfTest, testFileCandidates } from './files.mjs';

const existing =
  (...names) =>
  (name) =>
    names.includes(name);

describe('nearestTestFile', () => {
  it('finds a test beside the source, in __tests__ and in the mirrored test source set', () => {
    expect(nearestTestFile('src/a.ts', existing('src/a.test.ts'))).toEqual({
      path: 'src/a.test.ts',
      exists: true,
    });
    expect(nearestTestFile('src/a.ts', existing('src/__tests__/a.spec.ts'))?.exists).toBe(true);
    expect(
      nearestTestFile('mod/src/main/java/p/A.java', existing('mod/src/test/java/p/ATest.java')),
    ).toEqual({ path: 'mod/src/test/java/p/ATest.java', exists: true });
    expect(nearestTestFile('app/a.py', existing('tests/test_a.py'))?.path).toBe('tests/test_a.py');
    expect(nearestTestFile('pkg/a.go', existing('pkg/a_test.go'))?.path).toBe('pkg/a_test.go');
  });

  it('suggests the first conventional path when no test exists', () => {
    expect(nearestTestFile('src/a.ts', existing())).toEqual({
      path: 'src/a.test.ts',
      exists: false,
    });
    expect(nearestTestFile('README.md', existing())).toBeUndefined();
  });

  it('lists each candidate once', () => {
    const candidates = testFileCandidates('src/a.ts');

    expect(new Set(candidates).size).toBe(candidates.length);
  });
});

describe('subjectOfTest', () => {
  it.each([
    ['src/a.test.ts', ['src/a.ts'], 'src/a.ts'],
    ['src/__tests__/a.spec.mjs', ['src/a.mjs'], 'src/a.mjs'],
    ['m/src/test/java/p/ATest.java', ['m/src/main/java/p/A.java'], 'm/src/main/java/p/A.java'],
    ['tests/test_a.py', ['a.py'], 'a.py'],
    ['pkg/a_test.go', ['pkg/a.go'], 'pkg/a.go'],
    ['src/a.test.ts', [], undefined],
  ])('maps %s to its subject', (test, files, subject) => {
    expect(subjectOfTest(test, existing(...files))).toBe(subject);
  });
});
