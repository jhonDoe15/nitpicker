import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectTestRunner, testRunnerFor } from '../detect-runner.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-detection-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function manifest(fields) {
  return JSON.stringify({ name: 'p', ...fields });
}

function detect(files) {
  return detectTestRunner(projectWith(files));
}

const NODE_TEST_FILE = "import test from 'node:test';\ntest('a', () => {});\n";
const VITEST_FILE = "import { it } from 'vitest';\nit('a', () => {});\n";

describe('a configured test runner', () => {
  it.each(['vitest', 'jest', 'node', 'mocha'])('is used as it is for %s', (runner) => {
    const root = projectWith({ 'package.json': manifest({ devDependencies: { vitest: '4' } }) });

    expect(testRunnerFor(root, runner)).toEqual({
      runner,
      evidence: 'nitpicker.config.json "tools.tests.runner"',
      command: undefined,
    });
  });
});

describe('a detected test runner', () => {
  it.each([
    ['no test tooling', {}, { runner: 'vitest', evidence: 'the default' }],
    [
      'a vitest dependency',
      { 'package.json': manifest({ devDependencies: { vitest: '4' } }) },
      { runner: 'vitest', evidence: 'the vitest dependency' },
    ],
    ...['jest', 'ts-jest', 'babel-jest', '@jest/globals', 'react-scripts', '@craco/craco'].map(
      (name) => [
        `a ${name} dependency`,
        { 'package.json': manifest({ devDependencies: { [name]: '1' } }) },
        { runner: 'jest', evidence: `the ${name} dependency` },
      ],
    ),
    [
      'a vitest config file',
      { 'package.json': manifest({}), 'vitest.config.mts': '' },
      { runner: 'vitest', evidence: 'vitest.config.mts' },
    ],
    [
      'a jest config file',
      { 'package.json': manifest({}), 'jest.config.cjs': '' },
      { runner: 'jest', evidence: 'jest.config.cjs' },
    ],
    [
      'a jest key',
      { 'package.json': manifest({ jest: { testEnvironment: 'node' } }) },
      { runner: 'jest', evidence: 'package.json "jest"' },
    ],
    [
      'a jest test:* script',
      { 'package.json': manifest({ scripts: { 'test:unit': 'npx jest --ci' } }) },
      { runner: 'jest', evidence: 'package.json script "test:unit"', command: 'npx jest --ci' },
    ],
    [
      'a node --test script',
      { 'package.json': manifest({ scripts: { test: 'node --import tsx --test test/' } }) },
      {
        runner: 'node',
        evidence: 'package.json script "test"',
        command: 'node --import tsx --test test/',
      },
    ],
    [
      'a test file importing node:test',
      { 'package.json': manifest({}), 'test/a.test.js': NODE_TEST_FILE },
      { runner: 'node', evidence: '1 test file imports node:test' },
    ],
    [
      'a CommonJS test file requiring node:test',
      { 'package.json': manifest({}), 'test/a.test.cjs': "const test = require('node:test');\n" },
      { runner: 'node', evidence: '1 test file imports node:test' },
    ],
    [
      'test files importing @jest/globals',
      {
        'package.json': manifest({}),
        'test/a.test.js': "import { it } from '@jest/globals';\n",
        'test/b.test.js': "import { expect } from '@jest/globals';\n",
      },
      { runner: 'jest', evidence: '2 test files import @jest/globals' },
    ],
    [
      'a test file importing mocha',
      { 'package.json': manifest({}), 'test/a.test.js': "import { describe } from 'mocha';\n" },
      { runner: 'mocha', evidence: '1 test file imports mocha' },
    ],
  ])('comes from %s', (_name, files, expected) => {
    expect(detect(files)).toEqual(expected);
  });

  it.each([
    ['npm run', { test: 'npm run unit', unit: 'jest' }],
    ['pnpm run', { test: 'pnpm run unit', unit: 'jest' }],
    ['yarn', { test: 'yarn unit', unit: 'jest' }],
    ['two levels of', { test: 'npm run unit', unit: 'npm run jest:all', 'jest:all': 'jest' }],
  ])('follows %s script indirection', (_name, scripts) => {
    expect(detect({ 'package.json': manifest({ scripts }) })).toEqual({
      runner: 'jest',
      evidence: 'package.json script "test"',
      command: 'jest',
    });
  });

  it('stops at a script that runs itself', () => {
    const files = { 'package.json': manifest({ scripts: { test: 'npm run test' } }) };

    expect(detect(files)).toEqual({ runner: 'vitest', evidence: 'the default' });
  });

  it('takes the test script over the other test scripts and the config files', () => {
    const files = {
      'package.json': manifest({ scripts: { test: 'vitest run', 'test:legacy': 'jest' } }),
      'jest.config.js': '',
    };

    expect(detect(files)).toEqual({
      runner: 'vitest',
      evidence: 'package.json script "test"',
      command: 'vitest run',
    });
  });

  it('takes a config file over test-file imports and dependencies', () => {
    const files = {
      'package.json': manifest({ devDependencies: { vitest: '4', jest: '30' } }),
      'jest.config.js': '',
      'test/a.test.js': VITEST_FILE,
    };

    expect(detect(files)).toEqual({ runner: 'jest', evidence: 'jest.config.js' });
  });

  it('follows the runner most test files import', () => {
    const files = {
      'package.json': manifest({ devDependencies: { vitest: '4', jest: '30' } }),
      'test/a.test.js': VITEST_FILE,
      'test/b.test.js': VITEST_FILE,
      'test/c.test.js': NODE_TEST_FILE,
    };

    expect(detect(files)).toEqual({ runner: 'vitest', evidence: '2 test files import vitest' });
  });

  it('counts a file that imports Vitest and node:test once, for Vitest', () => {
    const files = {
      'package.json': manifest({}),
      'test/a.test.js': `${VITEST_FILE}${NODE_TEST_FILE}`,
    };

    expect(detect(files)).toEqual({ runner: 'vitest', evidence: '1 test file imports vitest' });
  });

  it('ignores a node:test import in a file that is not a test file', () => {
    const files = { 'package.json': manifest({}), 'src/main/helper.js': NODE_TEST_FILE };

    expect(detect(files)).toEqual({ runner: 'vitest', evidence: 'the default' });
  });

  it('follows the test files over a Jest dependency they do not use', () => {
    const files = {
      'package.json': manifest({ devDependencies: { jest: '30' } }),
      'test/a.test.js': NODE_TEST_FILE,
    };

    expect(detect(files)).toEqual({ runner: 'node', evidence: '1 test file imports node:test' });
  });
});
