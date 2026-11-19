import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mts';
import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';
import { resolveHeadPolicy } from '../../head-policy.mts';
import { withProjectTestFiles } from './project-test-files.mts';
import { defaultTestFiles } from './test-file-patterns.mts';
import { tempProjects } from '../../eslint-config/test-support/temp-projects.mts';

type TestAnalyzer = { readonly name: string; readonly policyFromPackage?: boolean };

const presetAnalyzer = (name: string): TestAnalyzer => ({ name, policyFromPackage: true });
const LINT: readonly TestAnalyzer[] = [presetAnalyzer('eslint-lint')];
const BOTH_RUNNERS = '{"devDependencies":{"vitest":"4","jest":"30"}}';
const AMBIGUITY =
  'found several test runners: Vitest (the vitest dependency) and Jest (the jest dependency). ' +
  'Set "tools.tests.runner" in nitpicker.config.json to "vitest" or "jest" to choose one.';

const projectWith = tempProjects('nitpicker-head-policy-runner-');

function testsFact(policy: unknown): Readonly<Record<string, unknown>> | undefined {
  const tests = fieldOf(fieldOf(policy, 'tools'), 'tests');
  return tests === undefined ? undefined : fieldsOf(tests);
}

function runnerOf(
  files: Readonly<Record<string, string>>,
  config: Readonly<Record<string, unknown>> = {},
) {
  return testsFact(resolveHeadPolicy(config, projectWith(files)));
}

function testsOf(
  files: Readonly<Record<string, string>>,
  {
    config = {},
    analyzers = LINT,
  }: {
    readonly config?: Readonly<Record<string, unknown>>;
    readonly analyzers?: readonly TestAnalyzer[];
  } = {},
) {
  const projectRoot = projectWith(files);
  const policy = fieldsOf(resolveHeadPolicy(config, projectRoot));
  return testsFact(
    withProjectTestFiles(policy, { projectRoot, liveProjectRoot: PACKAGE_ROOT, analyzers }),
  );
}

describe('head policy test runner fact', () => {
  it('records the runner the head checkout shows, so the lint config can follow it', () => {
    expect(runnerOf({ 'package.json': '{"scripts":{"test":"jest"}}' })).toEqual({
      detectedRunner: 'jest',
    });
    expect(runnerOf({ 'package.json': '{"scripts":{"test":"node --test"}}' })).toEqual({
      detectedRunner: 'node',
    });
    expect(runnerOf({ '.mocharc.json': '{}' })).toEqual({ detectedRunner: 'mocha' });
    expect(runnerOf({})).toEqual({ detectedRunner: 'vitest' });
  });

  it('keeps the configured runner next to the detected one', () => {
    const config = { tools: { tests: { runner: 'mocha' } } };

    expect(runnerOf({ 'package.json': '{"scripts":{"test":"jest"}}' }, config)).toEqual({
      runner: 'mocha',
      detectedRunner: 'jest',
    });
  });

  it('records it for a JavaScript preset too, and for no other preset', () => {
    const files = { 'package.json': '{"scripts":{"test":"mocha"}}' };

    expect(runnerOf(files, { preset: 'javascript' })).toEqual({ detectedRunner: 'mocha' });
    expect(runnerOf(files, { preset: 'java' })).toBeUndefined();
  });

  it('records two runners as an ambiguity instead of stopping the command', () => {
    expect(runnerOf({ 'package.json': BOTH_RUNNERS })).toEqual({
      detectedRunner: 'vitest',
      runnerAmbiguity: AMBIGUITY,
    });
  });

  it('falls back on the ambiguous runner the weaker evidence favours', () => {
    const files = {
      'jest.config.js': '',
      'vitest.config.mjs': '',
      'test/a.test.js': "import { it } from '@jest/globals';\n",
    };

    expect(runnerOf(files)).toEqual({
      detectedRunner: 'jest',
      runnerAmbiguity:
        'found several test runners: Vitest (vitest.config.mjs) and Jest (jest.config.js). ' +
        'Set "tools.tests.runner" in nitpicker.config.json to "vitest" or "jest" to choose one.',
    });
  });
});

describe('the test files of the head policy', () => {
  it('records the test files of the runner, once a preset analyzer needs them', () => {
    expect(testsOf({ 'package.json': '{"scripts":{"test":"jest"}}' })).toEqual({
      detectedRunner: 'jest',
      testFiles: defaultTestFiles('jest'),
    });
    expect(testsOf({ '.mocharc.json': '{}' })).toEqual({
      detectedRunner: 'mocha',
      testFiles: defaultTestFiles('mocha'),
    });
  });

  it('records the test files of the node:test script patterns', () => {
    const manifest = { scripts: { test: "node --test --test-name-pattern=x 'checks/**/*.js'" } };

    expect(testsOf({ 'package.json': JSON.stringify(manifest) })?.['testFiles']).toEqual({
      include: ['checks/**/*.js'],
      exclude: [],
      includeRegexes: [],
      excludeRegexes: [],
    });
  });

  it('follows the configured runner over the detected one', () => {
    const config = { tools: { tests: { runner: 'mocha' } } };

    expect(testsOf({ 'package.json': '{"scripts":{"test":"jest"}}' }, { config })).toEqual({
      runner: 'mocha',
      detectedRunner: 'jest',
      testFiles: defaultTestFiles('mocha'),
    });
  });

  it('reads no project config when no preset analyzer runs', () => {
    const files = {
      'package.json': '{"scripts":{"test":"mocha"}}',
      '.mocharc.cjs': "throw new Error('read');\n",
    };
    const analyzers = [{ name: 'custom-check' }];

    expect(testsOf(files, { analyzers })).toEqual({ detectedRunner: 'mocha' });
  });

  it('lets the lint run on an ambiguity, with a notice naming the runner it follows', () => {
    expect(testsOf({ 'package.json': BOTH_RUNNERS })).toEqual({
      detectedRunner: 'vitest',
      runnerAmbiguity: AMBIGUITY,
      testFiles: defaultTestFiles('vitest'),
      notices: [
        `Test runner detection ${AMBIGUITY} Until then the test-file lint rules follow Vitest, ` +
          'and coverage, CRAP and mutation testing cannot run.',
      ],
    });
  });

  it.each(['coverage', 'crap', 'mutation'])(
    'stops on an ambiguity once %s has to run the tests',
    (name) => {
      const analyzers = [...LINT, presetAnalyzer(name)];

      expect(() => testsOf({ 'package.json': BOTH_RUNNERS }, { analyzers })).toThrow(
        new Error(AMBIGUITY),
      );
    },
  );

  it.each([
    ['jest', '@types/jest', 'Jest'],
    ['mocha', '@types/mocha', 'Mocha'],
  ])(
    'names %s types package to install when the type check runs without it',
    (runner, packageName, name) => {
      const analyzers = [presetAnalyzer('typescript-typecheck')];

      expect(
        testsOf({ 'package.json': `{"scripts":{"test":"${runner}"}}` }, { analyzers })?.['notices'],
      ).toEqual([
        `The project runs its tests with ${name}, but ${packageName} is not installed, so the ` +
          `type check does not know the ${name} globals and does not report the errors they ` +
          `cause in test files. Install ${packageName} (npm install --save-dev ${packageName}) ` +
          'to have the tests type checked against them.',
      ]);
    },
  );

  it.each([
    {
      'package.json': '{"scripts":{"test":"vitest"}}',
      'vitest.config.mjs': "export default { test: { environment: 'jsdom' } };\n",
    },
    { 'package.json': '{"scripts":{"test":"jest"},"jest":{"testEnvironment":"jsdom"}}' },
    {
      'package.json': '{"scripts":{"test":"mocha"}}',
      '.mocharc.json': '{"require":["global-jsdom/register"]}',
    },
    { 'package.json': '{"scripts":{"test":"node --import global-jsdom/register --test"}}' },
  ])('records a DOM test environment for the runner of %j', (files) => {
    expect(testsOf(files)?.['domEnvironment']).toBe(true);
  });

  it('records no DOM test environment when the runner sets none', () => {
    expect(testsOf({ 'package.json': '{"scripts":{"test":"jest"}}' })?.['domEnvironment']).toBe(
      undefined,
    );
  });
});
