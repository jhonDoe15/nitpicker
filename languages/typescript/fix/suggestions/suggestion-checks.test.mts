import { describe, expect, it } from 'vitest';
import { keepsBehaviour } from './suggestion-checks.mts';

const RULE = 'no-unused-private-class-members';

function removes(member: string): boolean {
  const source = `class Counter {\n  ${member}\n}\n`;
  const start = source.indexOf(member);
  return keepsBehaviour(RULE, source, { start, end: start + member.length });
}

describe('keepsBehaviour', () => {
  it.each([
    '#label = "counter";',
    '#limit = -1;',
    '#next = () => register();',
    '#make = function () { return register(); };',
    '#names = ["a", { b: 1, c }];',
    '#mode = "a" as const;',
    '#count: number;',
    '#read() { return register(); }',
  ])('removes the member %s', (member) => {
    expect(removes(member)).toBe(true);
  });

  it.each([
    '#id = register();',
    '#created = new Date();',
    '#text = `${count}`;',
    '#names = [...others];',
    '#value = store.current;',
    '#picked = { [key]: 1 };',
    '@tracked #id = 1;',
  ])('keeps the member %s, whose removal changes what runs', (member) => {
    expect(removes(member)).toBe(false);
  });

  it('accepts the suggestions of other rules', () => {
    expect(keepsBehaviour('no-var', 'var a = f();', { start: 0, end: 12 })).toBe(true);
    expect(keepsBehaviour(undefined, '', { start: 0, end: 0 })).toBe(true);
  });
});
