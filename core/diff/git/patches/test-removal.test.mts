import { describe, expect, it } from 'vitest';
import {
  importedTargets,
  isTestFile,
  parseNumstat,
  removedTestTargetsOf,
  removesTests,
} from './test-removal.mts';

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
      { added: 3, removed: 4, file: 'new.py', baseFile: 'old.py' },
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

describe('the code a removed test imported', () => {
  it('resolves relative imports, mocks and requires next to the test file', () => {
    const text = [
      "import { a } from './a.mts';",
      "import type { B } from '../src/b.js';",
      "vi.mock('../src/c', () => ({}));",
      "const d = require('./d.cjs');",
      "import { e } from 'vitest';",
      "const label = 'just ./text';",
    ].join('\n');

    expect(importedTargets('app/tests/x.test.ts', text)).toEqual([
      'app/tests/a.mts',
      'app/src/b.js',
      'app/src/b.ts',
      'app/src/b.tsx',
      'app/src/c',
      ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].map(
        (each) => `app/src/c${each}`,
      ),
      ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].map(
        (each) => `app/src/c/index${each}`,
      ),
      'app/tests/d.cjs',
      'app/tests/d.cts',
    ]);
  });

  it('makes the targets relative to the project', () => {
    const texts = new Map([['app/a.test.ts', "import { a } from './a.ts';\nimport 'vitest';"]]);

    expect(removedTestTargetsOf(['app/a.test.ts'], texts, 'app')).toEqual(new Set(['a.ts']));
  });

  it('leaves out test data, which no test runner loads as a test', () => {
    const texts = new Map([
      ['tests/a.test.ts', "import { a } from '../a.ts';"],
      ['tests/expected/a.json', '{}'],
    ]);

    expect(removedTestTargetsOf(['tests/a.test.ts', 'tests/expected/a.json'], texts, '')).toEqual(
      new Set(['a.ts']),
    );
    expect(removedTestTargetsOf(['tests/expected/a.json'], texts, '')).toEqual(new Set());
  });

  it.each([
    ['imports nothing relative', new Map([['a.test.ts', "import { a } from '@app/a';"]])],
    ['cannot be read at the base', new Map<string, string>()],
    ['imports code outside the project', new Map([['a.test.ts', "import '../lib/b.ts';"]])],
    ['imports through an alias', new Map([['a.test.ts', "import './a.ts';\nimport '#/b';"]])],
    ['imports a barrel', new Map([['a.test.ts', "import './a.ts';\nimport '../index.ts';"]])],
    ['imports a directory', new Map([['a.test.ts', "import './a.ts';\nimport '..';"]])],
    [
      'imports a computed path',
      new Map([['a.test.ts', ['await import(`./cases/$', '{name}.ts`);'].join('')]]),
    ],
  ])('knows no targets when a removed test %s', (_name, texts) => {
    expect(removedTestTargetsOf(['a.test.ts'], texts, '')).toBeUndefined();
  });
});
