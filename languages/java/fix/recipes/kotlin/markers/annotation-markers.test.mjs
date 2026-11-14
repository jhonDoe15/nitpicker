import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import {
  generatedMarkerRecipe,
  jvmSyntheticRecipe,
  mutationIgnoreRecipe,
} from './annotation-markers.mjs';

describe('annotation marker recipes', () => {
  it('removes a Generated annotation on its own line, with its arguments', () => {
    const text = '@Generated("tool")\nclass A {\n    @Generated\n    fun run() {}\n}\n';

    expect(applyRecipe(generatedMarkerRecipe, text)).toBe('class A {\n    fun run() {}\n}\n');
    expect(plannedLines(generatedMarkerRecipe, text)).toEqual([1, 3]);
  });
  it('removes an inline annotation and the space after it', () => {
    expect(applyRecipe(generatedMarkerRecipe, '@Generated class A\n')).toBe('class A\n');
    expect(applyRecipe(generatedMarkerRecipe, '@Foo @Generated\nclass A\n')).toBe(
      '@Foo\nclass A\n',
    );
  });
  it('leaves the JPA GeneratedValue, file annotations and generated files alone', () => {
    const text = 'class A(@GeneratedValue val id: Long)\n';

    expect(applyRecipe(generatedMarkerRecipe, text)).toBe(text);
    expect(applyRecipe(generatedMarkerRecipe, '@file:Generated\nclass A\n')).toBe(
      '@file:Generated\nclass A\n',
    );
    expect(
      applyRecipe(generatedMarkerRecipe, '// @generated do not edit\n@Generated\nclass A\n'),
    ).toBe('// @generated do not edit\n@Generated\nclass A\n');
  });
  it('declines an annotation inside a bracketed group and leaves test sources alone', () => {
    expect(applyRecipe(generatedMarkerRecipe, '@[Foo Generated]\nclass A\n')).toBe(
      '@[Foo Generated]\nclass A\n',
    );
    const text = '@Generated\nclass ATest\n';

    expect(applyRecipe(generatedMarkerRecipe, text, 'src/test/kotlin/ATest.kt')).toBe(text);
  });
  it('removes JvmSynthetic and mutation markers in their own recipes', () => {
    expect(
      applyRecipe(jvmSyntheticRecipe, 'class A {\n    @JvmSynthetic\n    fun f() {}\n}\n'),
    ).toBe('class A {\n    fun f() {}\n}\n');
    expect(
      applyRecipe(mutationIgnoreRecipe, '@DoNotMutate\nfun f() {}\n@CoverageIgnore fun g() {}\n'),
    ).toBe('fun f() {}\nfun g() {}\n');
    expect(applyRecipe(mutationIgnoreRecipe, '@JvmSynthetic\nfun f() {}\n')).toBe(
      '@JvmSynthetic\nfun f() {}\n',
    );
  });
  it('marks the JvmSynthetic and mutation recipes as review fixes', () => {
    expect(
      [jvmSyntheticRecipe, mutationIgnoreRecipe, generatedMarkerRecipe].map((r) => r.safety),
    ).toEqual(['review', 'review', 'safe']);
  });
});
