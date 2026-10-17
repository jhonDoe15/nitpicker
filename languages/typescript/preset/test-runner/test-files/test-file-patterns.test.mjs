import { describe, expect, it } from 'vitest';
import { resolveLayout } from '../../layout.mjs';
import {
  defaultTestFiles,
  escapedGlob,
  mergedTestFiles,
  policyTestFiles,
  rootScopedGlobs,
  sourceRootGlobs,
  testFileMatcher,
  testFilePatterns,
} from './test-file-patterns.mjs';

function matching(patterns, files) {
  const matches = testFileMatcher(patterns);
  return files.filter((file) => matches(file));
}

const CANDIDATES = [
  'src/a.test.ts',
  'src/a.spec.tsx',
  'src/__tests__/a.js',
  'src/a-test.mjs',
  'src/a_test.js',
  'src/test-a.js',
  'src/test.js',
  'src/feature/test/a.js',
  'test/a.js',
  'test/unit/a.js',
  'test/a.ts',
  'src/a.js',
];

describe('the default test files of each runner', () => {
  it.each([
    ['vitest', ['src/a.test.ts', 'src/a.spec.tsx']],
    ['jest', ['src/a.test.ts', 'src/a.spec.tsx', 'src/__tests__/a.js', 'src/test.js']],
    [
      'node',
      [
        'src/a.test.ts',
        'src/a-test.mjs',
        'src/a_test.js',
        'src/test-a.js',
        'src/test.js',
        'src/feature/test/a.js',
        'test/a.js',
        'test/unit/a.js',
        'test/a.ts',
      ],
    ],
    ['mocha', ['test/a.js']],
  ])('match the files %s runs', (runner, files) => {
    expect(matching(defaultTestFiles(runner), CANDIDATES)).toEqual(files);
  });

  it('fall back to the Vitest naming for a policy that recorded no runner', () => {
    expect(policyTestFiles()).toEqual(defaultTestFiles('vitest'));
    expect(policyTestFiles({ detectedRunner: 'mocha' })).toEqual(defaultTestFiles('mocha'));
    expect(policyTestFiles({ runner: 'node', detectedRunner: 'mocha' })).toEqual(
      defaultTestFiles('node'),
    );
  });

  it('prefer the recorded test files over the defaults', () => {
    const testFiles = testFilePatterns({ include: ['./checks/*.js'] });

    expect(policyTestFiles({ detectedRunner: 'jest', testFiles })).toEqual({
      include: ['checks/*.js'],
      exclude: [],
      includeRegexes: [],
      excludeRegexes: [],
    });
  });
});

describe('testFileMatcher', () => {
  it('matches regular expressions against the path with a leading slash, minus exclusions', () => {
    const patterns = testFilePatterns({
      include: ['src/**/*.check.js'],
      exclude: ['src/legacy/**'],
      includeRegexes: [String.raw`/specs/.*\.js$`],
      excludeRegexes: ['/fixtures/'],
    });

    expect(
      matching(patterns, [
        'src/a.check.js',
        'src/legacy/b.check.js',
        'specs/c.js',
        'specs/fixtures/d.js',
        'src/e.js',
      ]),
    ).toEqual(['src/a.check.js', 'specs/c.js']);
  });

  it('merges the patterns of several runner configs without repeating them', () => {
    const merged = mergedTestFiles([
      testFilePatterns({ include: ['a/**'], excludeRegexes: ['/x/'] }),
      testFilePatterns({ include: ['a/**', 'b/**'], includeRegexes: ['/c/'] }),
    ]);

    expect(merged).toEqual({
      include: ['a/**', 'b/**'],
      exclude: [],
      includeRegexes: ['/c/'],
      excludeRegexes: ['/x/'],
    });
  });
});

describe('root-scoped globs', () => {
  it('scope a glob that matches anywhere to each root, also where the root is the folder it names', () => {
    expect(rootScopedGlobs(['src', '__tests__'], ['**/__tests__/**/*.js', 'test/*.js'])).toEqual([
      'src/**/__tests__/**/*.js',
      '__tests__/**/__tests__/**/*.js',
      '__tests__/**/*.js',
      'test/*.js',
    ]);
  });

  it('add only the runner globs a source root holds, beyond the Vitest naming', () => {
    expect(sourceRootGlobs(['src'], defaultTestFiles('vitest'))).toEqual([]);
    expect(sourceRootGlobs(['src'], defaultTestFiles('mocha'))).toEqual([]);
    expect(
      sourceRootGlobs(['src'], testFilePatterns({ include: ['**/*-test.js', 'src/x/*.js'] })),
    ).toEqual(['src/**/*-test.js', 'src/x/*.js']);
  });

  it('escapes a literal path for use as a glob', () => {
    expect(escapedGlob('src/[id]/a(1).test.js')).toBe(String.raw`src/\[id\]/a\(1\).test.js`);
  });
});

describe('the runner-aware layout', () => {
  it('treats the Jest, node:test and Mocha test files as tests, and only those as runnable', () => {
    const files = [
      'src/__tests__/a.js',
      'src/a-test.js',
      'test/a.js',
      'test/unit/a.js',
      'src/a.js',
    ];
    const summary = (runner) => {
      const layout = resolveLayout({}, [], { testFiles: defaultTestFiles(runner) });
      return files.map((file) => [file, layout.isTestFile(file), layout.isRunnableTestFile(file)]);
    };

    expect(summary('jest')).toEqual([
      ['src/__tests__/a.js', true, true],
      ['src/a-test.js', false, false],
      ['test/a.js', true, false],
      ['test/unit/a.js', true, false],
      ['src/a.js', false, false],
    ]);
    expect(summary('node')).toEqual([
      ['src/__tests__/a.js', true, false],
      ['src/a-test.js', true, true],
      ['test/a.js', true, true],
      ['test/unit/a.js', true, true],
      ['src/a.js', false, false],
    ]);
    expect(summary('mocha')).toEqual([
      ['src/__tests__/a.js', true, false],
      ['src/a-test.js', false, false],
      ['test/a.js', true, true],
      ['test/unit/a.js', true, false],
      ['src/a.js', false, false],
    ]);
  });

  it('adds the source-root test files of the runner to the test globs and keeps them out of source', () => {
    const layout = resolveLayout({}, [], { testFiles: defaultTestFiles('node') });

    expect(layout.isSourceFile('src/a-test.js')).toBe(false);
    expect(layout.runnerSourceTestGlobs).toEqual([
      'src/**/*.test.{cjs,mjs,js,cts,mts,ts}',
      'src/**/*-test.{cjs,mjs,js,cts,mts,ts}',
      'src/**/*_test.{cjs,mjs,js,cts,mts,ts}',
      'src/**/test-*.{cjs,mjs,js,cts,mts,ts}',
      'src/**/test.{cjs,mjs,js,cts,mts,ts}',
      'src/**/test/**/*.{cjs,mjs,js,cts,mts,ts}',
    ]);
    expect(layout.testGlobs.slice(-layout.runnerSourceTestGlobs.length)).toEqual(
      layout.runnerSourceTestGlobs,
    );
  });
});
