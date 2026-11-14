import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { watchJestConsole, withFormattedAssert } from './jest-assert.mts';

type BufferedEntry = { readonly message: string; readonly origin: string };
type TestConsole = {
  assert: (...values: readonly unknown[]) => void;
  getBuffer: () => BufferedEntry[] | undefined;
};
type ConsoleClass = new () => TestConsole;

function isConsoleClass(value: unknown): value is ConsoleClass {
  return typeof value === 'function';
}

const jestConsole: unknown = createRequire(import.meta.url)('@jest/console');
const loadedConsole = fieldOf(jestConsole, 'BufferedConsole');
if (!isConsoleClass(loadedConsole)) {
  throw new TypeError('@jest/console exports no BufferedConsole');
}
const BufferedConsole = loadedConsole;

function bufferAfter(consoleClass: ConsoleClass, values: readonly unknown[]): BufferedEntry[] {
  const testConsole = new consoleClass();
  testConsole.assert(...values);
  return testConsole.getBuffer() ?? [];
}

function assertedBy(consoleClass: ConsoleClass, values: readonly unknown[]): string[] {
  return bufferAfter(consoleClass, values).map(({ message }) => message);
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
    const error = new Error('thrown as is');

    expect(assertedBy(Formatted, [true, 'bad %s', { toString: () => 'never formatted' }])).toEqual(
      [],
    );
    expect(assertedBy(Formatted, [false, 'bad %s'])).toEqual([
      'AssertionError [ERR_ASSERTION]: bad %s',
    ]);
    expect(() => assertedBy(Formatted, [false, error, 'more'])).toThrow(error);
    expect(
      assertedBy(Formatted, [false, 'bad %s', { toString: () => assert.fail('no text') }]),
    ).toEqual(['AssertionError [ERR_ASSERTION]: bad %s']);
  });

  it('shows the frame that called console.assert as the origin, as Jest does', () => {
    class Formatted extends BufferedConsole {}
    withFormattedAssert(Formatted);

    const origin = bufferAfter(Formatted, [false, 'bad %s', 'input'])[0]?.origin ?? '';

    const [first] = origin.split('\n');

    expect([origin.includes('jest-assert.mts'), first?.includes('jest-assert.test.mts')]).toEqual([
      false,
      true,
    ]);
  });

  it('wraps the console class of @jest/console when it loads and nothing else', () => {
    class Formatted extends BufferedConsole {}
    class Other extends BufferedConsole {}
    const modules: Record<string, { readonly BufferedConsole: ConsoleClass }> = {
      '@jest/console': { BufferedConsole: Formatted },
      other: { BufferedConsole: Other },
    };
    const moduleClass = { _load: (request: string) => modules[request] };
    watchJestConsole(moduleClass);

    expect(moduleClass._load('other')).toBe(modules['other']);
    expect(moduleClass._load('@jest/console')).toBe(modules['@jest/console']);
    const wrapped = Formatted.prototype.assert;
    moduleClass._load('@jest/console');

    expect(Formatted.prototype.assert).toBe(wrapped);
    expect(Object.hasOwn(Other.prototype, 'assert')).toBe(false);
    expect(assertedBy(Formatted, [false, 'bad %s', 'input'])).toEqual([
      'AssertionError [ERR_ASSERTION]: bad input',
    ]);
  });
});
