import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { watchJestConsole, withFormattedAssert } from './jest-assert.mjs';

const { BufferedConsole } = createRequire(import.meta.url)('@jest/console');

function assertedBy(consoleClass, values) {
  const testConsole = new consoleClass();
  testConsole.assert(...values);
  return testConsole.getBuffer()?.map(({ message }) => message) ?? [];
}

describe('the Jest console.assert wrapper', () => {
  it('formats a failed assertion with every argument, as Node prints it', () => {
    class Formatted extends BufferedConsole {}
    withFormattedAssert(Formatted);

    expect(assertedBy(Formatted, [false, 'bad %s at %d', 'input', 3])).toEqual([
      'AssertionError [ERR_ASSERTION]: bad input at 3',
    ]);
    expect(assertedBy(Formatted, [undefined, 'bad %s', 'input'])).toEqual([
      'AssertionError [ERR_ASSERTION]: bad input',
    ]);
    expect(assertedBy(BufferedConsole, [false, 'bad %s at %d', 'input', 3])).toEqual([
      'AssertionError [ERR_ASSERTION]: bad %s at %d',
    ]);
  });

  it('leaves a passing assertion, a single message and a message that is no string as Jest has them', () => {
    class Formatted extends BufferedConsole {}
    withFormattedAssert(Formatted);
    withFormattedAssert(Formatted);
    const error = new Error('thrown as is');

    expect(assertedBy(Formatted, [true, 'bad %s', { toString: () => 'never formatted' }])).toEqual(
      [],
    );
    expect(assertedBy(Formatted, [false, 'bad %s'])).toEqual([
      'AssertionError [ERR_ASSERTION]: bad %s',
    ]);
    expect(() => assertedBy(Formatted, [false, error, 'more'])).toThrow(error);
  });

  it('wraps the console class of @jest/console when it loads and nothing else', () => {
    class Formatted extends BufferedConsole {}
    class Other extends BufferedConsole {}
    const modules = {
      '@jest/console': { BufferedConsole: Formatted },
      other: { BufferedConsole: Other },
    };
    const moduleClass = { _load: (request) => modules[request] };
    watchJestConsole(moduleClass);

    expect(moduleClass._load('other')).toBe(modules.other);
    expect(moduleClass._load('@jest/console')).toBe(modules['@jest/console']);
    expect(Object.hasOwn(Other.prototype, 'assert')).toBe(false);
    expect(assertedBy(Formatted, [false, 'bad %s', 'input'])).toEqual([
      'AssertionError [ERR_ASSERTION]: bad input',
    ]);
  });
});
