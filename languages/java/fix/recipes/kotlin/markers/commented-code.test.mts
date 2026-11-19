import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mts';
import { commentedCodeRecipe } from './commented-code.mts';

describe('commentedCodeRecipe', () => {
  it('deletes a group of commented-out lines with their lines', () => {
    const text = 'fun f() {\n    // val x = compute(1)\n    // x.run()\n    return\n}\n';

    expect(applyRecipe(commentedCodeRecipe, text)).toBe('fun f() {\n    return\n}\n');
    expect(plannedLines(commentedCodeRecipe, text)).toEqual([2]);
  });
  it('deletes a trailing comment and the spaces before it', () => {
    expect(applyRecipe(commentedCodeRecipe, 'val a = 1 // val b = compute(2)\n')).toBe(
      'val a = 1\n',
    );
  });
  it('deletes a block comment of code', () => {
    expect(applyRecipe(commentedCodeRecipe, 'fun f() {}\n/* val x = 1 */\nfun g() {}\n')).toBe(
      'fun f() {}\nfun g() {}\n',
    );
  });
  it('keeps prose, KDoc and TODO comments', () => {
    const text = '// This explains the choice below\n/** val x = 1 */\n// TODO x = 1\nfun f() {}\n';

    expect(applyRecipe(commentedCodeRecipe, text)).toBe(text);
  });
  it('also cleans test sources', () => {
    expect(
      applyRecipe(commentedCodeRecipe, '// val x = foo(1)\nclass T\n', 'src/test/kotlin/T.kt'),
    ).toBe('class T\n');
  });
  it.each([
    '// return null\nfun f() = 1\n',
    '// retries = 3\nfun f() = 1\n',
    '// flush()\nfun f() = 1\n',
    '// when (the user logs in)\nfun f() = 1\n',
    '// package private\nfun f() = 1\n',
    '// Disabled because of ticket ABC-123:\n// val flag = readFlag()\nfun f() = 1\n',
    'val a = 1 // b = 2\n',
    'fun f() = g(/* debug = true */)\n',
  ])('declines a comment that may be prose (%s)', (text) => {
    expect(applyRecipe(commentedCodeRecipe, text)).toBe(text);
  });
  it('deletes a commented-out block with its closing brace', () => {
    expect(
      applyRecipe(
        commentedCodeRecipe,
        'fun f() {\n    //if (k > 3) {\n    //    return 0\n    //}\n}\n',
      ),
    ).toBe('fun f() {\n}\n');
  });
});
