import { describe, expect, it } from 'vitest';
import { decide } from '../decide.mts';
import { print } from '../print.mts';
import { logical, not as negated } from '../terms.mts';
import { and, binary, call, member, name, not, number, or } from '../test-support/build.mts';
import { findShorter } from './find-shorter.mts';
import { skeletonOf, termOfSkeleton } from './skeleton.mts';
import { required } from '../typed/term-parts.mts';
import type { Term } from '../typed/term-types.mts';

type Value = number | boolean;
type Environment = Readonly<Record<string, Value>>;
type Shorter = NonNullable<ReturnType<typeof shorter>>;

const SOURCE = {
  rootContext: undefined,
  children: () => undefined,
  text: (term: Term) => print(term),
};
const n = name('n');
const x = name('x');
const a = name('a');
const b = name('b');
const c = name('c');
const u = name('u');

function shorter(term: Term, options = { booleanContext: true }) {
  return findShorter(skeletonOf(term, SOURCE), options);
}

function truthy(value: Value): boolean {
  return typeof value === 'number' ? value !== 0 && !Number.isNaN(value) : value;
}

function evaluate(term: Term, env: Environment): Value {
  if (term.kind === 'name') {
    return required(env[String(term.value)], 'a value for the name');
  }
  if (term.kind === 'literal') {
    return Number(term.value);
  }
  if (term.kind === 'unary') {
    return !truthy(evaluate(required(term.children[0], 'operand'), env));
  }
  const [left, right] = term.children.map((child) => evaluate(child, env));
  const operations = new Map<string | undefined, () => Value>([
    [
      '&&',
      () => (truthy(required(left, 'left')) ? required(right, 'right') : required(left, 'left')),
    ],
    [
      '||',
      () => (truthy(required(left, 'left')) ? required(left, 'left') : required(right, 'right')),
    ],
    ['>', () => Number(left) > Number(right)],
    ['>=', () => Number(left) >= Number(right)],
    ['<', () => Number(left) < Number(right)],
    ['<=', () => Number(left) <= Number(right)],
  ]);
  return required(operations.get(term.value), 'an operator')();
}

function environments() {
  const numbers = [Number.NaN, -1, 0, 3, 4, 5, 6, 9, 10, 15, 19, 20, 21];
  const flags = [true, false];
  return numbers.flatMap((value) =>
    flags.flatMap((p) =>
      flags.flatMap((q) => flags.map((r) => ({ n: value, x: value, a: p, b: q, c: r }))),
    ),
  );
}

async function expectProved(
  original: Term,
  found: Shorter,
  { grid }: { readonly grid: boolean } = { grid: true },
): Promise<void> {
  const after = termOfSkeleton(found.skeleton);
  const both = logical('||', [
    logical('&&', [original, after]),
    logical('&&', [negated(original), negated(after)]),
  ]);
  expect(await decide([], both)).toBe('true');
  const grids = grid ? environments() : [];
  expect(grids.map((env) => Boolean(evaluate(after, env)))).toEqual(
    grids.map((env) => Boolean(evaluate(original, env))),
  );
}

const range = (low: number, high: number): Term =>
  and(binary('>=', x, number(low)), binary('<', x, number(high)));

const SHAPES: [string, Term, string][] = [
  ['an implied operand of &&', and(binary('>', n, number(3)), binary('>', n, number(5))), 'n > 5'],
  ['an implying operand of ||', or(binary('>', n, number(5)), binary('>', n, number(3))), 'n > 3'],
  ['a complement merge', or(and(a, b), and(a, not(b))), 'a'],
  ['adjacent ranges', or(range(0, 10), range(10, 20)), 'x >= 0 && x < 20'],
  ['overlapping ranges', or(range(0, 12), range(10, 20)), 'x >= 0 && x < 20'],
  ['absorption', or(and(a, b), a), 'a'],
  ['consensus', or(or(and(b, c), and(a, b)), and(not(a), c)), 'a && b || !a && c'],
  ['a dual complement merge', and(or(a, b), or(a, not(b))), 'a'],
];

describe('findShorter', () => {
  it.each(SHAPES)('prints a proved shorter form for %s', async (_title, term, form) => {
    const found = required(shorter(term), 'a shorter form');

    expect(found.form).toBe(form);
    await expectProved(term, found);
  });

  it('names the later operand that implies the dropped one', () => {
    const found = shorter(and(binary('>', n, number(3)), binary('>', n, number(5))));

    expect(found?.reasons).toEqual(['`n > 5` later in the same `&&` implies it']);
  });

  it('keeps the guard of a member read and drops the implied read', async () => {
    const read = (value: number): Term => binary('>', member(u, 'n'), number(value));
    const term = and(and(binary('!==', u, name('nothing')), read(3)), read(5));
    const found = required(shorter(term), 'a shorter form');

    expect(found.form).toBe('u !== nothing && u.n > 5');
    await expectProved(term, found, { grid: false });
  });

  it('never drops an operand that guards a later read', () => {
    const guard = binary('!==', u, name('nothing'));
    const read = binary('>', member(u, 'n'), number(3));

    expect(shorter(or(and(guard, read), guard))).toBeUndefined();
    expect(shorter(and(read, and(guard, read)))).toBeUndefined();
  });

  it('leaves float comparisons and their negations alone', () => {
    expect(shorter(or(binary('<', x, number(5)), binary('>=', x, number(5))))).toBeUndefined();
    expect(shorter(and(not(binary('<', x, number(5))), binary('<', x, number(7))))).toBeUndefined();
    expect(shorter(or(not(binary('<', x, n)), binary('>=', x, n)))).toBeUndefined();
  });

  it('leaves operands with effects alone', () => {
    const next = call(name('next'));

    expect(
      shorter(and(binary('>', next, number(3)), binary('>', next, number(5)))),
    ).toBeUndefined();
    expect(shorter(or(and(a, next), and(a, not(next))))).toBeUndefined();
  });

  it('leaves conditions with more than 6 atoms alone', () => {
    const extra = ['d', 'e', 'f', 'g', 'h'].map((label) => name(label));
    const term = extra.reduce((left, right) => or(left, right), or(and(a, b), and(a, not(b))));

    expect(shorter(or(or(and(a, b), and(a, not(b))), name('d')))?.form).toBe('a || d');
    expect(shorter(term)).toBeUndefined();
  });

  it('does not repeat what the operands before decide', () => {
    expect(shorter(and(binary('>', n, number(5)), binary('>', n, number(3))))).toBeUndefined();
    expect(shorter(and(a, a))).toBeUndefined();
    expect(shorter(or(or(a, b), a))).toBeUndefined();
    expect(shorter(or(a, and(a, b)))).toBeUndefined();
    expect(shorter(or(or(and(a, b), and(not(a), c)), and(b, c)))).toBeUndefined();
  });

  it('takes a value that is not a boolean only as a condition', () => {
    const term = or(and(a, b), and(a, not(b)));

    expect(shorter(term, { booleanContext: false })).toBeUndefined();
    expect(shorter(term, { booleanContext: true })?.form).toBe('a');
  });
});
