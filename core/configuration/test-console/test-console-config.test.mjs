import { describe, expect, it } from 'vitest';
import { configuredAnalyzers } from '../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { resolveHeadPolicy } from '../../../languages/typescript/preset/head-policy.mjs';
import { applyDisable, describeConfigOverrides, describeDisableCascade } from '../config.mjs';
import { validateConfig } from '../validate.mjs';

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

  it('drops test-console and crap when coverage is disabled', () => {
    const names = applyDisable(analyzers, { disable: ['coverage'] }).map(({ name }) => name);

    expect(names).toEqual(
      analyzers
        .map(({ name }) => name)
        .filter((name) => !['coverage', 'crap', 'test-console'].includes(name)),
    );
  });

  it('applies a config written before test-console existed', () => {
    const config = validateConfig({ disable: ['coverage', 'crap'] });

    const names = applyDisable(analyzers, config).map(({ name }) => name);

    expect(names).toEqual(
      analyzers
        .map(({ name }) => name)
        .filter((name) => !['coverage', 'crap', 'test-console'].includes(name)),
    );
    expect(describeDisableCascade(analyzers, config)).toEqual([
      'coverage is disabled, so test-console is off too',
    ]);
  });

  it('keeps test-console while coverage runs', () => {
    const names = applyDisable(analyzers, { disable: ['crap'] }).map(({ name }) => name);

    expect(names).toEqual(analyzers.map(({ name }) => name).filter((name) => name !== 'crap'));
  });

  it('still rejects an unknown name next to a cascading one', () => {
    expect(() => applyDisable(analyzers, { disable: ['coverage', 'nope'] })).toThrow(
      /"disable" names unknown analyzers: nope/,
    );
  });
});
