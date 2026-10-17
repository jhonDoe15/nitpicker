import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { nodeScriptPatterns, runnerTestFiles } from './runner-test-files.mjs';
import { VITEST_TEST_FILES, defaultTestFiles } from './test-file-patterns.mjs';

const roots = [];

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
  return runnerTestFiles(projectWith(files), configured);
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
        excludeRegexes: ['/checks/slow/'],
      }),
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
