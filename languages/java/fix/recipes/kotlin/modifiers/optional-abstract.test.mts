import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mts';
import { optionalAbstractRecipe } from './optional-abstract.mts';

const fix = (text: string): string => applyRecipe(optionalAbstractRecipe, text);

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
  it.each([
    [
      'abstract in strings and comments',
      'interface A {\n    // abstract fun f()\n    val s: String get() = "abstract fun"\n}\n',
    ],
    ['a modifier with a comment after it', 'interface I {\n  abstract /* keep */ fun f()\n}\n'],
    [
      'abstract members of an abstract class that follows a bodyless interface',
      'interface Marker\n\nabstract class Shape {\n    abstract fun area(): Int\n}\n',
    ],
    [
      'abstract members of an abstract class declared in an interface',
      'interface R {\n    abstract class Impl : R {\n        abstract fun f(): Int\n    }\n}\n',
    ],
  ])('keeps %s', (_name, text) => {
    expect(fix(text)).toBe(text);
  });
});
