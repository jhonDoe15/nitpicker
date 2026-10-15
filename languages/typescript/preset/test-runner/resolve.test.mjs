import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayout } from '../layout.mjs';
import { resolveTestRunner } from './resolve.mjs';

const temporaryRoots = [];
const layout = resolveLayout();
const HINT =
  'Choose one with "tools": { "tests": { "runner": "vitest" | "jest" | "node-test" } } in nitpicker.config.json.';

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function manifest(fields) {
  return JSON.stringify({ name: 'p', ...fields });
}

function resolveFor(files, configured) {
  return resolveTestRunner({ projectRoot: projectWith(files), layout, configured });
}

const NODE_TEST_FILE = "import test from 'node:test';\ntest('a', () => {});\n";

describe('a configured test runner', () => {
  it.each(['vitest', 'jest', 'node-test'])('is used as it is for %s', (runner) => {
    expect(
      resolveFor({ 'package.json': manifest({ devDependencies: { vitest: '4' } }) }, runner),
    ).toEqual({
      runner,
      source: 'config',
    });
  });
});

describe('a detected test runner', () => {
  it.each([
    ['no test tooling', {}, 'vitest', 'default'],
    [
      'a vitest dependency',
      { 'package.json': manifest({ devDependencies: { vitest: '4' } }) },
      'vitest',
      'detected',
    ],
    [
      'a vitest config file',
      { 'package.json': manifest({}), 'vitest.config.mts': '' },
      'vitest',
      'detected',
    ],
    [
      'a jest dependency',
      { 'package.json': manifest({ devDependencies: { jest: '30' } }) },
      'jest',
      'detected',
    ],
    [
      'a jest config file',
      { 'package.json': manifest({}), 'jest.config.cjs': '' },
      'jest',
      'detected',
    ],
    [
      'a jest key',
      { 'package.json': manifest({ jest: { testEnvironment: 'node' } }) },
      'jest',
      'detected',
    ],
    [
      'a jest test script',
      { 'package.json': manifest({ scripts: { 'test:unit': 'npx jest --ci' } }) },
      'jest',
      'detected',
    ],
    [
      'a node --test script',
      { 'package.json': manifest({ scripts: { test: 'node --import tsx --test test/' } }) },
      'node-test',
      'detected',
    ],
    [
      'a test file importing node:test',
      { 'package.json': manifest({}), 'test/a.test.js': NODE_TEST_FILE },
      'node-test',
      'detected',
    ],
    [
      'a CommonJS test file requiring node:test',
      { 'package.json': manifest({}), 'src/a.test.cjs': "const test = require('node:test');\n" },
      'node-test',
      'detected',
    ],
  ])('comes from %s', (_name, files, runner, source) => {
    expect(resolveFor(files)).toEqual({ runner, source });
  });

  it('ignores a node:test import in a file that also imports Vitest', () => {
    const files = {
      'package.json': manifest({}),
      'test/a.test.js': "import { it } from 'vitest';\nimport test from 'node:test';\n",
    };

    expect(resolveFor(files)).toEqual({ runner: 'vitest', source: 'default' });
  });

  it('ignores a node:test import in a file that is not a test file', () => {
    const files = { 'package.json': manifest({}), 'src/helper.js': NODE_TEST_FILE };

    expect(resolveFor(files)).toEqual({ runner: 'vitest', source: 'default' });
  });
});

describe('several test runners', () => {
  const both = { devDependencies: { vitest: '4', jest: '30' } };

  it('are told apart by the test script', () => {
    const files = { 'package.json': manifest({ ...both, scripts: { test: 'jest' } }) };

    expect(resolveFor(files)).toEqual({ runner: 'jest', source: 'detected' });
  });

  it('fail with the explicit choice when no script settles it', () => {
    expect(() => resolveFor({ 'package.json': manifest(both) })).toThrow(
      `nitpicker.config.json: found several test runners (Vitest: "vitest" in package.json dependencies; Jest: "jest" in package.json dependencies). ${HINT}`,
    );
  });

  it('fail when the scripts run both', () => {
    const files = {
      'package.json': manifest({ ...both, scripts: { test: 'vitest run', 'test:legacy': 'jest' } }),
    };

    expect(() => resolveFor(files)).toThrow(
      `nitpicker.config.json: found several test runners (Vitest: "vitest" in package.json dependencies, script "test"; Jest: "jest" in package.json dependencies, script "test:legacy"). ${HINT}`,
    );
  });

  it('are settled by the explicit choice', () => {
    expect(resolveFor({ 'package.json': manifest(both) }, 'jest')).toEqual({
      runner: 'jest',
      source: 'config',
    });
  });
});
