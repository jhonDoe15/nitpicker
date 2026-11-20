import { describe, expect, it } from 'vitest';
import { withSortedUnions } from './union-order.mts';

const CASES: readonly (readonly [string, string])[] = [
  ['string', 'string'],
  ['"b" | "a"', '"a" | "b"'],
  ['B | A | undefined', 'A | B | undefined'],
  ['(b: Z | Y) => D | C', '(b:Y | Z)=>C | D'],
  ['((a: B | A) => void) | A', '((a:A | B)=>void) | A'],
  ['{ b: Y | X; a?: "q" | "p";}', '{a?:"p" | "q";b:X | Y;}'],
  ['[B | A, D | C][]', '[A | B,C | D][]'],
  ['T extends B | A ? D | C : F | E', 'T extends A | B?C | D:E | F'],
  ['(x: unknown) => x is B | A', '(x:unknown)=>x is A | B'],
  ['{ [K in "b" | "a"]: K;}', '{[K in "a" | "b"]:K;}'],
  ['"x | a" | "a"', '"a" | "x | a"'],
  ['`b${string}` | `a|${string}`', '`a|${string}` | `b${string}`'],
  ['"\\"|z" | B', '"\\"|z" | B'],
  ['é | Z | a', 'Z | a | é'],
  ['B) | A', 'B) | A'],
  ['{ z: { d: 1; c: 2;}; (a: Q): R; a: 1;}[]', '{(a:Q):R;a:1;z:{c:2;d:1;};}[]'],
  ['a; b', 'a;b'],
  ['`id-${string & { k: "z" | "a"; }}` | A', 'A | `id-${string & {k:"a" | "z";}}`'],
  ['`p${B | A}q${D | C}` | `a`', '`a` | `p${A | B}q${C | D}`'],
  [
    '`\\u00E9\\uD83D\\uDE00\\uD800\\u0041\\\\u00E9${string}`',
    '`\u{e9}\u{1f600}\\uD800\\u0041\\\\u00E9${string}`',
  ],
  ['`a${`b${Z | Y}`}`', '`a${`b${Y | Z}`}`'],
  ['"\ud800" | A', '"\\uD800" | A'],
];

describe('the order of union and object members in type text', () => {
  it.each(CASES)('writes %s as %s', (written, expected) => {
    expect(withSortedUnions(written)).toBe(expected);
  });
});
