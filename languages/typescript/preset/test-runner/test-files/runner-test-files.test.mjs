import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { nodeScriptPatterns, runnerTestFileFacts, runnerTestFiles } from './runner-test-files.mjs';
import { VITEST_TEST_FILES, defaultTestFiles } from './test-file-patterns.mjs';

const roots = [];
const JEST_DEFAULT_MATCH = [
  '**/__tests__/**/*.?([mc])[jt]s?(x)',
  '**/?(*.)+(spec|test).?([mc])[jt]s?(x)',
];

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-test-files-'));
  roots.push(root);
  symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof text === 'string' ? text : JSON.stringify(text));
  }
  return root;
}

function patterns({ include = [], exclude = [], includeRegexes = [], excludeRegexes = [] }) {
  return { include, exclude, includeRegexes, excludeRegexes };
}

function testFilesOf(files, configured) {
  return runnerTestFiles(projectWith(files), { configured });
}

describe('the node:test script patterns', () => {
  it('keeps the positional patterns and skips option values', () => {
    expect(
      nodeScriptPatterns([
        '--test-name-pattern',
        'parse',
        '--import',
        './setup.mjs',
        '--test-reporter=spec',
        'test/**/*.mjs',
        'checks/*.js',
      ]),
    ).toEqual(['test/**/*.mjs', 'checks/*.js']);
  });

  it('skips the value of every valued test option', () => {
    expect(
      nodeScriptPatterns([
        '--test-global-setup',
        'setup/global.mjs',
        '--test-isolation',
        'none',
        '--test-shard',
        '1/2',
        '--test-concurrency',
        '2',
        '--test-coverage-include',
        'src/**',
        '--experimental-test-isolation',
        'process',
        '--env-file',
        '.env.test',
        'checks/**/*.test.js',
      ]),
    ).toEqual(['checks/**/*.test.js']);
  });

  it('falls back to the node:test default patterns without a positional one', () => {
    expect(testFilesOf({ 'package.json': { scripts: { test: 'node --test' } } })).toEqual(
      defaultTestFiles('node'),
    );
  });
});

describe('the Mocha spec', () => {
  it('reads the spec and ignore of the .mocharc file', () => {
    const files = {
      'package.json': { scripts: { test: 'mocha' } },
      '.mocharc.json': { spec: ['./spec/**/*.spec.js'], ignore: ['spec/slow/**'] },
    };

    expect(testFilesOf(files)).toEqual(
      patterns({ include: ['spec/**/*.spec.js'], exclude: ['spec/slow/**'] }),
    );
  });

  it('expands a spec folder by the extensions, recursively when the script says so', () => {
    const files = {
      'package.json': { scripts: { test: 'mocha --recursive --extension ts checks' } },
      'checks/a.ts': '',
    };

    expect(testFilesOf(files)).toEqual(patterns({ include: ['checks/**/*.ts'] }));
  });

  it('defaults to the test folder, and adds the extensions to a spec that names no file', () => {
    expect(
      testFilesOf({ 'package.json': { scripts: { test: 'mocha' } }, 'test/a.js': '' }),
    ).toEqual(patterns({ include: ['test/*.{js,cjs,mjs}'] }));
    expect(testFilesOf({ 'package.json': { scripts: { test: 'mocha test/main' } } })).toEqual(
      patterns({ include: ['test/main.{js,cjs,mjs}'] }),
    );
  });
});

describe('the Jest test files', () => {
  it('reads testMatch and testPathIgnorePatterns from the config the script names', () => {
    const files = {
      'package.json': { scripts: { test: 'jest -c config/jest.config.cjs' } },
      'config/jest.config.cjs': [
        'module.exports = {',
        "  rootDir: '..',",
        "  testMatch: ['<rootDir>/checks/**/*.js', '!**/fixtures/**'],",
        "  testPathIgnorePatterns: ['<rootDir>/checks/slow/'],",
        '};',
        '',
      ].join('\n'),
    };

    expect(testFilesOf(files)).toEqual(
      patterns({
        include: ['checks/**/*.js'],
        exclude: ['**/fixtures/**'],
        excludeRegexes: ['^/checks/slow/'],
      }),
    );
  });

  it('anchors an ignore pattern that starts at the rootDir, with or without a caret', () => {
    const files = {
      'package.json': {
        scripts: { test: 'jest' },
        jest: { testPathIgnorePatterns: ['^<rootDir>/build/', '<rootDir>/dist/'] },
      },
    };

    expect(testFilesOf(files)).toEqual(
      patterns({ include: JEST_DEFAULT_MATCH, excludeRegexes: ['^/build/', '^/dist/'] }),
    );
  });

  it('keeps the matches under the roots of the project', () => {
    const files = {
      'package.json': {
        scripts: { test: 'jest' },
        jest: { roots: ['<rootDir>/test'], testMatch: ['**/*.ts'] },
      },
      'test/a.ts': '',
    };

    expect(testFilesOf(files)).toEqual(
      patterns({ include: ['test/**/*.ts'], excludeRegexes: ['/node_modules/'] }),
    );
  });

  it('leaves out a project whose runner lints or type-checks instead of running tests', () => {
    const files = {
      'package.json': { scripts: { test: 'jest' } },
      'lint-runner.js': 'module.exports = class LintRunner { async runTests() {} };\n',
      'jest.config.cjs': [
        'module.exports = {',
        '  projects: [',
        "    { runner: '<rootDir>/lint-runner.js', testMatch: ['<rootDir>/src/**/*.js'] },",
        "    { testMatch: ['<rootDir>/test/**/*.test.js'] },",
        '  ],',
        '};',
        '',
      ].join('\n'),
    };

    expect(testFilesOf(files)).toEqual(
      patterns({ include: ['test/**/*.test.js'], excludeRegexes: ['/node_modules/'] }),
    );
  });

  it('reads testRegex', () => {
    const files = {
      'package.json': {
        scripts: { test: 'jest' },
        jest: { testRegex: String.raw`/specs/.*\.js$` },
      },
    };

    expect(testFilesOf(files)).toEqual(
      patterns({
        includeRegexes: [String.raw`/specs/.*\.js$`],
        excludeRegexes: ['/node_modules/'],
      }),
    );
  });
});

describe('the Vitest test files', () => {
  it("adds the project config's include and exclude to the nitpicker naming", () => {
    const files = {
      'package.json': { scripts: { test: 'vitest run' } },
      'vitest.config.mjs': [
        'export default {',
        "  test: { include: ['checks/**/*.check.ts'], exclude: ['checks/slow/**'] },",
        '};',
        '',
      ].join('\n'),
    };

    expect(testFilesOf(files)).toEqual(
      patterns({
        include: [...VITEST_TEST_FILES, 'checks/**/*.check.ts'],
        exclude: ['checks/slow/**'],
      }),
    );
  });

  it('follows the configured runner over the detected one', () => {
    expect(testFilesOf({ 'package.json': { scripts: { test: 'vitest' } } }, 'mocha')).toEqual(
      patterns({ include: ['test/*.{js,cjs,mjs}'] }),
    );
  });
});

describe('a project config the test files cannot be read from', () => {
  const BROKEN = "throw new Error('broken config');\n";
  const cases = [
    {
      runner: 'jest',
      files: { 'package.json': { scripts: { test: 'jest' } }, 'jest.config.cjs': BROKEN },
      notice: /^The Jest config could not be read \([\s\S]*broken config[\s\S]*\), so nitpicker/u,
    },
    {
      runner: 'vitest',
      files: { 'package.json': { scripts: { test: 'vitest' } }, 'vitest.config.mjs': BROKEN },
      notice: /^The Vitest config vitest\.config\.mjs could not be read \([\s\S]*broken config/u,
    },
    {
      runner: 'mocha',
      files: { 'package.json': { scripts: { test: 'mocha' } }, '.mocharc.cjs': BROKEN },
      notice: /^The Mocha options could not be read \([\s\S]*broken config[\s\S]*\), so nitpicker/u,
    },
  ];

  it.each(cases)('carries the $runner read failure into a notice', ({ runner, files, notice }) => {
    expect(runnerTestFileFacts(projectWith(files), {})).toEqual({
      testFiles: defaultTestFiles(runner),
      domEnvironment: false,
      notices: [expect.stringMatching(notice)],
    });
  });

  it('loads a .mocharc.cjs in a child process, never in the nitpicker process', () => {
    const files = {
      'package.json': { scripts: { test: 'mocha' } },
      '.mocharc.cjs':
        "globalThis.loadedMocharc = true;\nmodule.exports = { spec: 'checks/*.js' };\n",
    };

    expect(testFilesOf(files)).toEqual(patterns({ include: ['checks/*.js'] }));
    expect(globalThis.loadedMocharc).toBeUndefined();
  });
});
