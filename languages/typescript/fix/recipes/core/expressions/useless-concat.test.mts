import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { applied } from '../test-support/apply-recipe.mts';
import { uselessConcatRecipe } from './useless-concat.mts';

function moduleOf(expression: string): string {
  return `export const value = ${expression};\n`;
}

function valueOf(source: string): unknown {
  return runInNewContext(source.replace('export const value = ', 'globalThis.value = '), {});
}

describe('uselessConcatRecipe', () => {
  it.each([
    ["'a' + 'b'", "'ab'"],
    ['"say " + "\'hi\'"', '"say \'hi\'"'],
    ["'it' + \"'s\"", "'it\\'s'"],
    ["'a\\\\' + 'n'", "'a\\\\n'"],
    ["'line\\n' + 'two'", "'line\\ntwo'"],
    ["'caf\\u00e9' + ' ok'", "'café ok'"],
    ["'smile ' + '😀'", "'smile 😀'"],
    ['`tick ` + "`"', '`tick \\``'],
    ['`cost ` + "${x}"', '`cost \\${x}`'],
    ["prefix + 'a' + 'b'", "prefix + 'ab'"],
  ])('joins %s into %s with the same value', (expression, expected) => {
    const text = `const prefix = 1;\n${moduleOf(expression)}`;
    const fixed = applied(uselessConcatRecipe, text);

    expect(fixed).toEqual({ text: `const prefix = 1;\n${moduleOf(expected)}`, notes: [] });
    expect(valueOf(fixed.text)).toBe(valueOf(text));
  });

  it.each([
    ["const x = 1;\nexport const value = `a${x}` + 'b';\n", 'a side is not a plain string'],
    ["export const value = 'a\\\n' + 'b';\n", 'a literal continues over a line break'],
    ["'use ' + 'strict';\n", 'joining would drop a comment or make a directive'],
    [
      "export const value = 'a' + /* why */ 'b';\n",
      'joining would drop a comment or make a directive',
    ],
  ])('leaves %j with a note', (text, reason) => {
    const fixed = applied(uselessConcatRecipe, text);

    expect(fixed.text).toBe(text);
    expect(fixed.notes).toEqual([expect.stringContaining(`eslint/no-useless-concat: ${reason}`)]);
  });
});
