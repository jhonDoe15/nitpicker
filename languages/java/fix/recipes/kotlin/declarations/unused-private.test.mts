import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mts';
import { unusedPrivateRecipe } from './unused-private.mts';

const fix = (text: string): string => applyRecipe(unusedPrivateRecipe, text);

describe('unusedPrivateRecipe', () => {
  it('removes a private property that nothing reads', () => {
    expect(fix('class A {\n    private val unusedName = listOf(1, 2)\n    val b = 1\n}\n')).toBe(
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
  it.each([
    'class A {\n    private val unused = listOf(1, 2)\n        .map { it }\n}\n',
    'class A {\n    private val unused = listOf(1, 2)\n\n        ?.map { it }\n}\n',
    'class A {\n    private val unused = 1 +\n        2\n}\n',
    'class A {\n    private val unused = 1\n        + 2\n}\n',
    'class A {\n    private val unused = foo\n        ?: bar\n}\n',
    'class A {\n    private val unused = a\n        && b\n}\n',
    'class A {\n    private val unused = a ||\n        b\n}\n',
    'class A {\n    private val unused = a,\n        b\n}\n',
  ])('declines a multi-line initializer (%s)', (text) => {
    expect(fix(text)).toBe(text);
  });
  it.each([
    'class A {\n    private val registered = registry.add("x")\n}\n',
    'class A {\n    private val started = start()\n}\n',
    'class A {\n    private val items = listOf(load())\n}\n',
    'class A {\n    private val w = 1\n        get() = field + 1\n}\n',
    'class A {\n    private var w = 1\n        set(value) { field = value }\n}\n',
  ])('keeps a property with a side effect or an accessor (%s)', (text) => {
    expect(fix(text)).toBe(text);
  });
});
