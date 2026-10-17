import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { resolveHeadPolicy, withProjectTestFiles } from '../../head-policy.mjs';
import { defaultTestFiles } from './test-file-patterns.mjs';

const temporaryRoots = [];
const presetAnalyzer = (name) => ({ name, policyFromPackage: true });
const LINT = [presetAnalyzer('eslint-lint')];
const BOTH_RUNNERS = '{"devDependencies":{"vitest":"4","jest":"30"}}';
const AMBIGUITY =
  'found several test runners: Vitest (the vitest dependency) and Jest (the jest dependency). ' +
  'Set "tools.tests.runner" in nitpicker.config.json to "vitest" or "jest" to choose one.';

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-head-policy-runner-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function runnerOf(files, config = {}) {
  return resolveHeadPolicy(config, projectWith(files)).tools?.tests;
}

function testsOf(files, { config = {}, analyzers = LINT } = {}) {
  const projectRoot = projectWith(files);
  const policy = resolveHeadPolicy(config, projectRoot);
  return withProjectTestFiles(policy, { projectRoot, liveProjectRoot: PACKAGE_ROOT, analyzers })
    .tools?.tests;
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

    expect(testsOf({ 'package.json': JSON.stringify(manifest) })?.testFiles).toEqual({
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

  it('stops on an ambiguity once an analyzer has to run the tests', () => {
    for (const name of ['coverage', 'crap', 'mutation']) {
      const analyzers = [...LINT, presetAnalyzer(name)];

      expect(() => testsOf({ 'package.json': BOTH_RUNNERS }, { analyzers })).toThrow(
        new Error(AMBIGUITY),
      );
    }
  });

  it('names the runner types package to install when the type check runs without it', () => {
    const analyzers = [presetAnalyzer('typescript-typecheck')];

    for (const [runner, packageName, name] of [
      ['jest', '@types/jest', 'Jest'],
      ['mocha', '@types/mocha', 'Mocha'],
    ]) {
      expect(
        testsOf({ 'package.json': `{"scripts":{"test":"${runner}"}}` }, { analyzers }).notices,
      ).toEqual([
        `The project runs its tests with ${name}, but ${packageName} is not installed, so the ` +
          `type check does not know the ${name} globals and does not report the errors they ` +
          `cause in test files. Install ${packageName} (npm install --save-dev ${packageName}) ` +
          'to have the tests type checked against them.',
      ]);
    }
  });

  it('records a DOM test environment for every runner', () => {
    const projects = [
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
    ];

    for (const files of projects) {
      expect(testsOf(files).domEnvironment).toBe(true);
    }
    expect(testsOf({ 'package.json': '{"scripts":{"test":"jest"}}' }).domEnvironment).toBe(
      undefined,
    );
  });
});
