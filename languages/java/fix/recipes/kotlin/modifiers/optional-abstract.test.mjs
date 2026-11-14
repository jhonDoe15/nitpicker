import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { optionalAbstractRecipe } from './optional-abstract.mjs';

const fix = (text) => applyRecipe(optionalAbstractRecipe, text);

describe('optionalAbstractRecipe', () => {
  it('drops abstract from interface members', () => {
    expect(
      fix('interface A {\n    abstract fun f()\n    abstract val x: Int\n    fun g() {}\n}\n'),
    ).toBe('interface A {\n    fun f()\n    val x: Int\n    fun g() {}\n}\n');
  });
  it('drops abstract from an interface declaration', () => {
    expect(fix('abstract interface A {\n    fun f()\n}\n')).toBe('interface A {\n    fun f()\n}\n');
    expect(plannedLines(optionalAbstractRecipe, 'class B\nabstract interface A\n')).toEqual([2]);
  });
  it('keeps abstract members of abstract classes', () => {
    const text =
      'abstract class A {\n    abstract fun f()\n    interface I { abstract fun g() }\n}\n';

    expect(fix(text)).toBe(
      'abstract class A {\n    abstract fun f()\n    interface I { fun g() }\n}\n',
    );
  });
  it('keeps abstract in strings and comments', () => {
    const text =
      'interface A {\n    // abstract fun f()\n    val s: String get() = "abstract fun"\n}\n';

    expect(fix(text)).toBe(text);
  });
  it('declines a modifier with a comment after it', () => {
    const text = 'interface I {\n  abstract /* keep */ fun f()\n}\n';

    expect(applyRecipe(optionalAbstractRecipe, text)).toBe(text);
  });
});
