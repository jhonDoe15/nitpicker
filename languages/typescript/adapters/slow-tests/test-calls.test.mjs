import { describe, expect, it } from 'vitest';
import { testCallsOf } from './test-calls.mjs';

const SOURCE = `describe('checkout', () => {
  it('pays', () => {});
  it.each([[1, 2]])('adds %i and %i', (a, b) => {});
  describe.each(cases)('plan $name', () => {
    test(\`row \${n}\`, () => {});
  });
  it(title, () => {});
  it.skip('skipped', () => {});
});
`;

describe('test calls of a source file', () => {
  it('lists each test with its title pattern, text and line', () => {
    expect(
      testCallsOf('a.test.ts', SOURCE).map(({ key, dynamic, text, line }) => ({
        key,
        dynamic,
        text,
        line,
      })),
    ).toEqual([
      { key: 'checkout pays', dynamic: false, text: "it('pays', () => {})", line: 2 },
      {
        key: 'checkout adds .* and .*',
        dynamic: false,
        text: "it.each([[1, 2]])('adds %i and %i', (a, b) => {})",
        line: 3,
      },
      {
        key: 'checkout plan .* row .*',
        dynamic: false,
        text: 'test(`row ${n}`, () => {})',
        line: 5,
      },
      { key: 'checkout .*', dynamic: true, text: 'it(title, () => {})', line: 7 },
      { key: 'checkout skipped', dynamic: false, text: "it.skip('skipped', () => {})", line: 8 },
    ]);
  });

  it('matches the full names the runners report, also for table and dynamic titles', () => {
    const matchers = testCallsOf('a.test.ts', SOURCE).map(({ matcher }) => matcher);
    const names = [
      'checkout pays',
      'checkout adds 1 and 2',
      'checkout plan x row 3',
      'checkout any',
    ];
    expect(names.map((name) => matchers.map((matcher) => matcher.test(name)))).toEqual([
      [true, false, false, true, false],
      [false, true, false, true, false],
      [false, false, true, true, false],
      [false, false, false, true, false],
    ]);
  });

  it('ignores calls that are not tests and joins concatenated titles', () => {
    const source = "expect(1).toBe(1);\nit('a ' + name + ' b', () => {});\n";
    expect(testCallsOf('a.test.ts', source).map(({ key, line }) => [key, line])).toEqual([
      ['a .* b', 2],
    ]);
  });
});
