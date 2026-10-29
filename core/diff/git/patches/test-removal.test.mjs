import { describe, expect, it } from 'vitest';
import { isTestFile, parseNumstat, removesTests } from './test-removal.mjs';

describe('which files are tests', () => {
  it.each([
    ['tests/test_a.py', true],
    ['src/test/java/a/AppTest.java', true],
    ['src/__tests__/a.ts', true],
    ['src/a.spec.ts', true],
    ['src/a.test.mjs', true],
    ['app/conftest.py', true],
    ['src/main/kotlin/a/AppIT.kt', true],
    ['src/main/java/a/App.java', false],
    ['src/latest.ts', false],
    ['src/attest.py', false],
  ])('%s: %s', (file, expected) => {
    expect(isTestFile(file)).toBe(expected);
  });
});

describe('reading the numstat output', () => {
  it('reads plain entries and renames', () => {
    const output = ['1\t2\ta.py', '3\t4\t', 'old.py', 'new.py', '-\t-\timage.png', ''].join('\0');

    expect(parseNumstat(output)).toEqual([
      { added: 1, removed: 2, file: 'a.py' },
      { added: 3, removed: 4, file: 'new.py' },
      { added: Number.NaN, removed: Number.NaN, file: 'image.png' },
    ]);
  });
});

describe('removesTests', () => {
  it.each([
    ['a test file that lost lines', [{ added: 1, removed: 4, file: 'tests/test_a.py' }], true],
    ['a test file that only grew', [{ added: 4, removed: 1, file: 'tests/test_a.py' }], false],
    ['a repaired assertion', [{ added: 1, removed: 1, file: 'tests/test_a.py' }], false],
    ['a source file that lost lines', [{ added: 0, removed: 9, file: 'src/a.py' }], false],
    [
      'a binary test file',
      [{ added: Number.NaN, removed: Number.NaN, file: 'tests/a.bin' }],
      false,
    ],
  ])('%s: %s', (_name, entries, expected) => {
    expect(removesTests(entries)).toBe(expected);
  });
});
