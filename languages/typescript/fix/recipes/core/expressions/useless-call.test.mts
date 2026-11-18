import { describe, expect, it } from 'vitest';
import { applied } from '../test-support/apply-recipe.mts';
import { uselessCallRecipe } from './useless-call.mts';

const PRELUDE =
  'declare function run(value: number, other?: number): number;\ndeclare const store: { add(value: number): number; inner: { add(value: number): number } };\ndeclare function make(): typeof store;\ndeclare const values: number[];\n';

function fixedExpression(expression: string): {
  readonly text: string;
  readonly notes: readonly string[];
} {
  const fixed = applied(uselessCallRecipe, `${PRELUDE}export const value = ${expression};\n`);
  return { text: fixed.text.slice(PRELUDE.length), notes: fixed.notes };
}

describe('uselessCallRecipe', () => {
  it.each([
    ['run.call(undefined, 1)', 'run(1)'],
    ['run.call(void 0, 1, 2)', 'run(1, 2)'],
    ['run.apply(undefined, [1, 2])', 'run(1, 2)'],
    ['run.apply(undefined, [...values])', 'run(...values)'],
    ['store.add.call(store, 1)', 'store.add(1)'],
    ['store.inner.add.apply(store.inner, [1])', 'store.inner.add(1)'],
    ['((value: number) => value).call(undefined, 1)', '((value: number) => value)(1)'],
  ])('writes %s as %s', (from, to) => {
    expect(fixedExpression(from)).toEqual({ text: `export const value = ${to};\n`, notes: [] });
  });

  it.each([
    ['make().add.call(make(), 1)', 'the receiver is read twice'],
    ['run.call(null, 1)', 'this would change from null'],
    ['store.add?.call(store, 1)', 'optional chain'],
    ['run.call(undefined, /* first */ 1)', 'a comment sits in the call'],
  ])('leaves %s with a note', (expression, reason) => {
    const fixed = fixedExpression(expression);

    expect(fixed.text).toBe(`export const value = ${expression};\n`);
    expect(fixed.notes).toEqual([expect.stringContaining(reason)]);
  });
});
