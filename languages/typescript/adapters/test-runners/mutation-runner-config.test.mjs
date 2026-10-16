import { describe, expect, it } from 'vitest';
import { mutationRunnerConfig } from './mutation-runner-config.mjs';

const SOURCE_CONFIG = {
  mutate: ['src/**/*.ts'],
  plugins: ['vitest-runner'],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.quality.config.ts' },
  checkers: ['typescript'],
  tsconfigFile: '.nitpicker-diff-tsconfig.stryker.json',
};

function configFor(runner, arguments_ = [], nodeArguments = []) {
  return mutationRunnerConfig({
    options: { projectRoot: '/p' },
    runner,
    command: { environment: {}, nodeArguments, arguments_ },
    testFiles: ['/p/test/a.test.ts'],
    sourceConfig: SOURCE_CONFIG,
  });
}

describe('the Stryker runner for each test runner', () => {
  it('keeps the Vitest companion config for Vitest', () => {
    const config = configFor('vitest');

    expect(config.testRunner).toBe('vitest');
    expect(config.vitest).toEqual({ configFile: 'vitest.quality.config.ts' });
    expect(config.plugins.map((plugin) => plugin.split('/').at(-4))).toEqual([
      'vitest-runner',
      'typescript-checker',
    ]);
  });

  it('runs Jest with its own config and leaves type errors to the checker', () => {
    const config = configFor('jest', ['--config', 'jest.unit.js'], ['--experimental-vm-modules']);

    expect({
      ...config,
      plugins: config.plugins.map((plugin) => plugin.split('/').at(-4)),
    }).toEqual({
      mutate: ['src/**/*.ts'],
      plugins: ['jest-runner', 'typescript-checker'],
      testRunner: 'jest',
      checkers: ['typescript'],
      tsconfigFile: '.nitpicker-diff-tsconfig.stryker.json',
      testRunnerNodeArgs: ['--experimental-vm-modules'],
      jest: { projectType: 'custom', enableFindRelatedTests: false, configFile: 'jest.unit.js' },
      disableTypeChecks: true,
    });
  });

  it('gives Mocha the specs and requires of the test script plus the test files', () => {
    expect(
      configFor('mocha', ['--require=test/env.js', '-r', 'x', '--ui', 'tdd', 'test/']).mochaOptions,
    ).toEqual({
      require: ['test/env.js', 'x'],
      ui: 'tdd',
      spec: ['test/', 'test/a.test.ts'],
    });
  });

  it('runs node:test files through the TAP runner with the node options of the script', () => {
    const config = configFor('node', ['test/**/*.test.js'], ['--import', 'tsx']);

    expect(config.testRunner).toBe('tap');
    expect(config.tap).toEqual({
      testFiles: ['test/**/*.test.js'],
      nodeArgs: ['--import', 'tsx'],
      forceBail: true,
    });
  });
});
