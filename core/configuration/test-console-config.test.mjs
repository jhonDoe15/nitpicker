import { describe, expect, it } from 'vitest';
import { configuredAnalyzers } from '../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { applyDisable, describeConfigOverrides } from './config.mjs';
import { validateConfig } from './validate.mjs';

const allowed = { contains: 'is no longer supported', reason: 'react 17 shim' };

describe('testConsole config', () => {
  it.each([
    [{ testConsole: {} }],
    [{ testConsole: { allow: [] } }],
    [{ testConsole: { allow: [allowed, { ...allowed, paths: ['test/legacy/**'] }] } }],
    [{ preset: 'python', testConsole: { allow: [{ ...allowed, paths: ['tests/legacy/**'] }] } }],
  ])('accepts %j', (config) => {
    expect(validateConfig(config)).toEqual(config);
  });

  it.each([
    [{ testConsole: [] }, /"testConsole" must be an object/],
    [{ testConsole: { ignore: [] } }, /unknown testConsole key "ignore"/],
    [{ testConsole: { allow: {} } }, /"testConsole.allow" must be an array/],
    [{ testConsole: { allow: [1] } }, /"testConsole.allow\[0\]" must be an object/],
    [{ testConsole: { allow: [{ ...allowed, extra: 1 }] } }, /unknown key "extra"/],
    [
      { testConsole: { allow: [{ ...allowed, pattern: '^a+$' }] } },
      /unknown key "pattern" in "testConsole.allow\[0\]": use "contains"/,
    ],
    [{ testConsole: { allow: [{ reason: 'why' }] } }, /contains" must keep at least 3 characters/],
    [{ testConsole: { allow: [{ ...allowed, contains: ' a b ' }] } }, /at least 3 characters/],
    [{ testConsole: { allow: [{ ...allowed, contains: '404' }] } }, /at least 3 characters/],
    [{ testConsole: { allow: [{ ...allowed, contains: '\u001b[31m\u001b[0m' }] } }, /at least 3/],
    [{ testConsole: { allow: [{ ...allowed, contains: ' 12 <n> ' }] } }, /at least 3 characters/],
    [{ testConsole: { allow: [{ ...allowed, paths: [] }] } }, /needs at least one path glob/],
    [{ testConsole: { allow: [{ ...allowed, paths: 'test/**' }] } }, /paths" must be an array/],
    [{ testConsole: { allow: [{ contains: 'abc' }] } }, /reason" is required/],
    [{ testConsole: { allow: [{ contains: 'abc', reason: ' ' }] } }, /reason" is required/],
    [
      { preset: 'java', testConsole: { allow: [allowed] } },
      'nitpicker.config.json: "testConsole" is not supported with "preset": "java". Supported with: typescript, javascript, python',
    ],
    [
      { preset: 'kotlin', testConsole: {} },
      '"testConsole" is not supported with "preset": "kotlin"',
    ],
  ])('rejects %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it('reaches every analyzer through the head policy and changes the policy hash', () => {
    const testConsole = { allow: [allowed] };

    expect(resolveHeadPolicy({ testConsole }).testConsole).toEqual(testConsole);
    expect(resolveHeadPolicy({})).not.toHaveProperty('testConsole');
    expect(describeConfigOverrides({ testConsole })).toEqual([
      `testConsole: ${JSON.stringify(testConsole)}`,
    ]);
  });
});

describe('test-console analyzer and disable', () => {
  const analyzers = configuredAnalyzers();

  it('is turned off by name', () => {
    const names = applyDisable(analyzers, { disable: ['test-console'] }).map(({ name }) => name);

    expect(names).toEqual(
      analyzers.map(({ name }) => name).filter((name) => name !== 'test-console'),
    );
  });

  it('names every dependent of coverage at once', () => {
    expect(() => applyDisable(analyzers, { disable: ['coverage'] })).toThrow(
      '"disable" cannot disable coverage because crap and test-console depend on it; add them to "disable" too',
    );
  });

  it('names the one dependent left', () => {
    expect(() => applyDisable(analyzers, { disable: ['coverage', 'crap'] })).toThrow(
      '"disable" cannot disable coverage because test-console depends on it; add it to "disable" too',
    );
  });

  it('is turned off together with coverage and its other dependents', () => {
    const disable = ['coverage', 'crap', 'test-console'];
    const names = applyDisable(analyzers, { disable }).map(({ name }) => name);

    expect(names).not.toContain('test-console');
  });

  it('lists three dependents with commas', () => {
    const analyzers = [
      { name: 'coverage' },
      { name: 'crap', dependencies: ['coverage'] },
      { name: 'mutation', dependencies: ['coverage'] },
      { name: 'test-console', dependencies: ['coverage'] },
    ];

    expect(() => applyDisable(analyzers, { disable: ['coverage'] })).toThrow(
      '"disable" cannot disable coverage because crap, mutation and test-console depend on it; add them to "disable" too',
    );
  });
});
