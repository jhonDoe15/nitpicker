import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate.mjs';

const allowed = { contains: 'is no longer supported', reason: 'driver shim' };

describe('testConsole config', () => {
  it.each([
    [{ testConsole: {} }],
    [{ testConsole: { allow: [] } }],
    [{ testConsole: { allow: [allowed, { ...allowed, paths: ['src/test/legacy/**'] }] } }],
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
    [{ testConsole: { allow: [{ ...allowed, paths: [] }] } }, /needs at least one path glob/],
    [{ testConsole: { allow: [{ ...allowed, paths: 'test/**' }] } }, /paths" must be an array/],
    [{ testConsole: { allow: [{ contains: 'abc' }] } }, /reason" is required/],
    [{ testConsole: { allow: [{ contains: 'abc', reason: ' ' }] } }, /reason" is required/],
  ])('rejects %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it.each([['java'], ['kotlin'], ['typescript'], ['python']])(
    'is valid with the %s preset',
    (preset) => {
      const config = { preset, testConsole: { allow: [allowed] } };

      expect(validateConfig(config)).toEqual(config);
    },
  );
});
