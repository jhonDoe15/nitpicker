import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../../head-policy.mjs';
import { detectTestRunner, testRunnerFor } from '../detect-runner.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-ambiguity-'));
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

const BOTH_DEPENDENCIES = { devDependencies: { vitest: '4', jest: '30' } };
const VITEST_FILE = "import { it } from 'vitest';\n";
const NODE_TEST_FILE = "import test from 'node:test';\n";
const choose = (choices) =>
  `Set "tools.tests.runner" in nitpicker.config.json to ${choices} to choose one.`;

describe('balanced test runner evidence', () => {
  it.each([
    [
      'both runner dependencies and no script',
      { 'package.json': manifest(BOTH_DEPENDENCIES) },
      'Vitest (the vitest dependency) and Jest (the jest dependency)',
      '"vitest" or "jest"',
    ],
    [
      'a Jest config and a Vitest test:* script',
      {
        'package.json': manifest({ scripts: { 'test:unit': 'vitest run' } }),
        'jest.config.js': '',
      },
      'Vitest (package.json script "test:unit") and Jest (jest.config.js)',
      '"vitest" or "jest"',
    ],
    [
      'a test script that runs two runners',
      { 'package.json': manifest({ scripts: { test: 'vitest run && node --test' } }) },
      'Vitest (package.json script "test") and node:test (package.json script "test")',
      '"vitest" or "node"',
    ],
    [
      'as many test files for each runner',
      { 'test/a.test.js': VITEST_FILE, 'test/b.test.js': NODE_TEST_FILE },
      'Vitest (1 test file imports vitest) and node:test (1 test file imports node:test)',
      '"vitest" or "node"',
    ],
    [
      'three config files',
      { 'vitest.config.ts': '', 'jest.config.js': '', '.mocharc.yml': '' },
      'Vitest (vitest.config.ts), Jest (jest.config.js) and Mocha (.mocharc.yml)',
      '"vitest", "jest" or "mocha"',
    ],
  ])('stops on %s with the evidence and the key that chooses', (_name, files, found, choices) => {
    expect(() => detectTestRunner(projectWith(files))).toThrow(
      new Error(`found several test runners: ${found}. ${choose(choices)}`),
    );
  });

  it('is settled by the configured runner', () => {
    const root = projectWith({ 'package.json': manifest(BOTH_DEPENDENCIES) });

    expect(testRunnerFor(root, 'jest')).toEqual({
      runner: 'jest',
      evidence: 'nitpicker.config.json "tools.tests.runner"',
      command: undefined,
    });
  });
});

describe('the head policy test runner check', () => {
  it('stops before any analyzer runs when the head shows two runners', () => {
    const root = projectWith({ 'package.json': manifest(BOTH_DEPENDENCIES) });

    expect(() => resolveHeadPolicy({}, root)).toThrow(
      new Error(
        `found several test runners: Vitest (the vitest dependency) and Jest (the jest dependency). ${choose('"vitest" or "jest"')}`,
      ),
    );
  });

  it('records the configured runner and no detected one when the evidence is balanced', () => {
    const root = projectWith({ 'package.json': manifest(BOTH_DEPENDENCIES) });

    expect(resolveHeadPolicy({ tools: { tests: { runner: 'jest' } } }, root).tools.tests).toEqual({
      runner: 'jest',
    });
  });

  it('does not look for a test runner under the Java and Python presets', () => {
    const root = projectWith({ 'package.json': manifest(BOTH_DEPENDENCIES) });

    expect(resolveHeadPolicy({ preset: 'java' }, root).tools).toBeUndefined();
    expect(resolveHeadPolicy({ preset: 'python' }, root).tools).toBeUndefined();
  });
});
