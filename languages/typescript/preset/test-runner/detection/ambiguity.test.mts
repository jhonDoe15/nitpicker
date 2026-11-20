import { describe, expect, it } from 'vitest';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { resolveHeadPolicy } from '../../head-policy.mts';
import { useTemporaryProjects } from '../../test-support/temporary-projects.mts';
import { detectTestRunner, testRunnerFor } from '../detect-runner.mts';

const { projectWith } = useTemporaryProjects('nitpicker-runner-ambiguity-');

function testsFact(policy: unknown): unknown {
  return fieldOf(fieldOf(policy, 'tools'), 'tests');
}

function manifest(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ name: 'p', ...fields });
}

const BOTH_DEPENDENCIES = { devDependencies: { vitest: '4', jest: '30' } };
const VITEST_FILE = "import { it } from 'vitest';\n";
const NODE_TEST_FILE = "import test from 'node:test';\n";
const choose = (choices: string): string =>
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
  it('records two runners the head shows, for the analyzers that run tests to stop on', () => {
    const root = projectWith({ 'package.json': manifest(BOTH_DEPENDENCIES) });

    expect(testsFact(resolveHeadPolicy({}, root))).toEqual({
      detectedRunner: 'vitest',
      runnerAmbiguity: `found several test runners: Vitest (the vitest dependency) and Jest (the jest dependency). ${choose('"vitest" or "jest"')}`,
    });
  });

  it('records the configured runner and no detected one when the evidence is balanced', () => {
    const root = projectWith({ 'package.json': manifest(BOTH_DEPENDENCIES) });

    expect(testsFact(resolveHeadPolicy({ tools: { tests: { runner: 'jest' } } }, root))).toEqual({
      runner: 'jest',
    });
  });

  it('does not look for a test runner under the Java and Python presets', () => {
    const root = projectWith({ 'package.json': manifest(BOTH_DEPENDENCIES) });

    expect(fieldOf(resolveHeadPolicy({ preset: 'java' }, root), 'tools')).toBeUndefined();
    expect(fieldOf(resolveHeadPolicy({ preset: 'python' }, root), 'tools')).toBeUndefined();
  });
});
