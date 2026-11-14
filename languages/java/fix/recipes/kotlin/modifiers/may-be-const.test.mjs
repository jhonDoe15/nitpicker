import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { mayBeConstRecipe, mayBeConstReviewRecipe } from './may-be-const.mjs';

const fix = (text) => applyRecipe(mayBeConstReviewRecipe, applyRecipe(mayBeConstRecipe, text));

describe('mayBeConstRecipe', () => {
  it.each([
    ['val A = 1', 'const val A = 1'],
    ['private val NAME = "x"', 'private const val NAME = "x"'],
    ['internal val ID: Long = 5L', 'internal const val ID: Long = 5L'],
    ['val RATE = 0.5f // note', 'const val RATE = 0.5f // note'],
    ["val C = 'x'", "const val C = 'x'"],
    ['val ON = true;', 'const val ON = true;'],
    ['val NEG = -1', 'const val NEG = -1'],
  ])('marks top-level %s', (before, after) => {
    expect(fix(`${before}\n`)).toBe(`${after}\n`);
  });
  it('marks properties of objects and companion objects', () => {
    expect(
      fix(
        'object A {\n    val X = 1\n}\nclass B {\n    companion object {\n        private val Y = "y"\n    }\n}\n',
      ),
    ).toBe(
      [
        'object A {\n    const val X = 1\n}\nclass B {',
        '    companion object {\n        private const val Y = "y"\n    }\n}\n',
      ].join('\n'),
    );
    expect(plannedLines(mayBeConstReviewRecipe, 'object A {\n    val X = 1\n}\n')).toEqual([2]);
  });
  it.each([
    'class A {\n    val X = 1\n}',
    'fun f() {\n    val X = 1\n}',
    'val A = "a$b"',
    'val A = compute()',
    'val A = 1 + 2',
    'val A: Any = 1',
    'var A = 1',
    'const val A = 1',
    'override val A = 1',
    '@JvmField\nval A = 1',
    'val A = 1\n    get() = 2',
    'val A by lazy { 1 }',
    'val o = object {\n    val X = 1\n}',
  ])('declines %s', (text) => {
    expect(fix(`${text}\n`)).toBe(`${text}\n`);
  });
  it('leaves public properties to the review pass because Java callers use the getter', () => {
    const text = 'object Cfg {\n    val X = 1\n}\nval TOP = 2\n';

    expect(applyRecipe(mayBeConstRecipe, text)).toBe(text);
    expect(applyRecipe(mayBeConstReviewRecipe, text)).toBe(
      'object Cfg {\n    const val X = 1\n}\nconst val TOP = 2\n',
    );
    expect(mayBeConstRecipe.safety).toBe('safe');
    expect(mayBeConstReviewRecipe.safety).toBe('review');
  });
});
