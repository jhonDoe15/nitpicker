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
  ])('accepts %j', (config) => {
    expect(validateConfig(config)).toEqual(config);
  });

  it.each([
    [{ testConsole: [] }, /"testConsole" must be an object/],
    [{ testConsole: { ignore: [] } }, /unknown testConsole key "ignore"/],
    [{ testConsole: { allow: {} } }, /"testConsole.allow" must be an array/],
    [{ testConsole: { allow: [1] } }, /"testConsole.allow\[0\]" must be an object/],
    [{ testConsole: { allow: [{ ...allowed, extra: 1 }] } }, /unknown key "extra"/],
    [{ testConsole: { allow: [{ ...allowed, pattern: '^a+$' }] } }, /unknown key "pattern"/],
    [{ testConsole: { allow: [{ reason: 'why' }] } }, /contains" must be a message substring/],
    [{ testConsole: { allow: [{ ...allowed, contains: ' a b ' }] } }, /at least 3 characters/],
    [{ testConsole: { allow: [{ ...allowed, paths: [] }] } }, /needs at least one path glob/],
    [{ testConsole: { allow: [{ ...allowed, paths: 'test/**' }] } }, /paths" must be an array/],
    [{ testConsole: { allow: [{ contains: 'abc' }] } }, /reason" is required/],
    [{ testConsole: { allow: [{ contains: 'abc', reason: ' ' }] } }, /reason" is required/],
    [{ preset: 'python', testConsole: { allow: [allowed] } }, /"testConsole" is not supported/],
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

  it('keeps coverage on while test-console depends on it', () => {
    expect(() => applyDisable(analyzers, { disable: ['coverage', 'crap'] })).toThrow(
      'cannot disable coverage because test-console depends on it',
    );
  });

  it('is turned off together with coverage and its other dependents', () => {
    const disable = ['coverage', 'crap', 'test-console'];
    const names = applyDisable(analyzers, { disable }).map(({ name }) => name);

    expect(names).not.toContain('test-console');
  });
});
