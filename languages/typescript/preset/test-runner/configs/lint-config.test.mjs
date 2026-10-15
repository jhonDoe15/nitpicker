import { describe, expect, it } from 'vitest';
import { testRunnerLintSettings, testRunnerSettings } from './lint-config.mjs';

describe('testRunnerLintSettings', () => {
  it('passes the Vitest globals through unchanged', () => {
    const globals = { vi: 'readonly' };
    expect(testRunnerLintSettings('vitest', globals)).toEqual({ globals, rules: {} });
  });

  it('declares the Jest globals and turns off the Vitest-only rule', () => {
    expect(testRunnerLintSettings('jest', {})).toEqual({
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
      rules: { 'vitest/prefer-called-exactly-once-with': 'off' },
    });
  });

  it('declares no globals for node:test and accepts its assertions', () => {
    expect(testRunnerLintSettings('node-test', { vi: 'readonly' })).toEqual({
      globals: {},
      rules: {
        'vitest/no-import-node-test': 'off',
        '@typescript-eslint/no-floating-promises': [
          'error',
          {
            allowForKnownSafeCalls: [
              {
                from: 'package',
                package: '@types/node',
                name: [
                  'after',
                  'afterEach',
                  'before',
                  'beforeEach',
                  'describe',
                  'it',
                  'suite',
                  'test',
                ],
              },
            ],
          },
        ],
        'vitest/expect-expect': [
          'error',
          { assertFunctionNames: ['expect', 'assert', 'assert.*', 't.assert.*'] },
        ],
      },
    });
  });
});

describe('testRunnerSettings', () => {
  it('adds no settings for Vitest', () => {
    expect(testRunnerSettings('vitest')).toEqual({});
  });

  it.each(['jest', 'node-test'])('records %s for the nitpicker rules', (runner) => {
    expect(testRunnerSettings(runner)).toEqual({ settings: { nitpicker: { testRunner: runner } } });
  });
});
