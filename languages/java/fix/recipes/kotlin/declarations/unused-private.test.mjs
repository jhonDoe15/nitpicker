import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mjs';
import { unusedPrivateRecipe } from './unused-private.mjs';

const fix = (text) => applyRecipe(unusedPrivateRecipe, text);

describe('unusedPrivateRecipe', () => {
  it('removes a private property that nothing reads', () => {
    expect(fix('class A {\n    private val unusedName = compute()\n    val b = 1\n}\n')).toBe(
      'class A {\n    val b = 1\n}\n',
    );
    expect(plannedLines(unusedPrivateRecipe, 'class A {\n    private var cache = 1\n}\n')).toEqual([
      2,
    ]);
  });
  it('removes a private function that nothing calls, with its body', () => {
    expect(
      fix(
        'class A {\n    private fun helper(x: Int): Int {\n        return x\n    }\n\n    fun run() {}\n}\n',
      ),
    ).toBe('class A {\n\n    fun run() {}\n}\n');
  });
  it('is a review fix', () => {
    expect(unusedPrivateRecipe.safety).toBe('review');
  });
  it.each([
    'class A {\n    private val x = 1\n    fun f() = x\n}\n',
    'class A {\n    private val x = 1\n    fun f() = "$x"\n}\n',
    'class A {\n    private fun h() {}\n    fun f() = h()\n}\n',
    'class A {\n    private fun h() {}\n    private fun h(x: Int) {}\n}\n',
    'class A {\n    @Inject\n    private val x = 1\n}\n',
    'class A {\n    private val ignored = 1\n}\n',
    'class A {\n    private val x by lazy { 1 }\n}\n',
    'class A {\n    private val x = listOf(\n        1,\n    )\n}\n',
    'class A {\n    private fun h() = 1\n}\n',
    'class A(private val x: Int)\n',
  ])('declines %s', (text) => {
    expect(fix(text)).toBe(text);
  });
});
