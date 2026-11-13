import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { modifierOrderRecipe } from './modifier-order.mjs';

const fix = (text) => applyRecipe(modifierOrderRecipe, text);

describe('modifierOrderRecipe', () => {
  it.each([
    ['open private fun f() {}', 'private open fun f() {}'],
    ['override public fun f() {}', 'public override fun f() {}'],
    ['suspend override fun f() {}', 'override suspend fun f() {}'],
    ['data private class A(val a: Int)', 'private data class A(val a: Int)'],
    ['inline private fun <T> f(t: T) = t', 'private inline fun <T> f(t: T) = t'],
    ['lateinit private var x: String', 'private lateinit var x: String'],
    ['object-free\ncompanion public object', 'object-free\npublic companion object'],
    ['operator override fun plus() = 1', 'override operator fun plus() = 1'],
    ['abstract public class A', 'public abstract class A'],
    ['fun private interface A', 'private fun interface A'],
    ['const private val X = 1', 'private const val X = 1'],
    ['class A(override private val x: Int)', 'class A(private override val x: Int)'],
  ])('reorders %s', (before, after) => {
    expect(fix(before)).toBe(after);
  });
  it('keeps separators, such as a line break between modifiers', () => {
    expect(fix('open\n    private fun f() {}')).toBe('private\n    open fun f() {}');
  });
  it('leaves ordered modifiers, other words and strings alone', () => {
    const text = [
      'private open fun f() {}',
      'override suspend fun g() {}',
      'val data = 1',
      'val s = "open private fun"',
      '// open private fun',
      'suspend fun h() {}',
    ].join('\n');

    expect(fix(text)).toBe(text);
  });
  it('reports the line and works in test sources', () => {
    expect(plannedLines(modifierOrderRecipe, 'class A\nopen private fun f() {}\n')).toEqual([2]);
    expect(
      applyRecipe(modifierOrderRecipe, 'open private fun f() {}\n', 'src/test/kotlin/T.kt'),
    ).toBe('private open fun f() {}\n');
  });
  it.each(['open /* keep me */ private class A\n', 'open // why\n private class A\n'])(
    'declines a run of modifiers with a comment inside (%s)',
    (text) => {
      expect(fix(text)).toBe(text);
    },
  );
});
