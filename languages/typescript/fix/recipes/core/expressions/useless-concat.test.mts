import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { applied, leftNote } from '../test-support/apply-recipe.mts';
import { uselessConcatRecipe } from './useless-concat.mts';

function moduleOf(expression: string): string {
  return `export const value = ${expression};\n`;
}

function valueOf(source: string): unknown {
  return runInNewContext(source.replace('export const value = ', 'globalThis.value = '), {});
}

const DIRECTIVE = 'joining would drop a comment or make a directive';
const PARENTHESIS = 'a parenthesis sits between the literals';

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
    [`\`cost \` + "\${x}"`, `\`cost \\\${x}\``],
    ["prefix + 'a' + 'b'", "prefix + 'ab'"],
  ])('joins %s into %s with the same value', (expression, expected) => {
    const text = `const prefix = 1;\n${moduleOf(expression)}`;
    const fixed = applied(uselessConcatRecipe, text);

    expect(fixed).toEqual({ text: `const prefix = 1;\n${moduleOf(expected)}`, notes: [] });
    expect(valueOf(fixed.text)).toBe(valueOf(text));
  });

  it.each([
    [
      `const x = 1;\nexport const value = \`a\${x}\` + 'b';\n`,
      2,
      'a side is not a plain string or a template without expressions',
    ],
    ["export const value = 'a\\\n' + 'b';\n", 2, 'a literal continues over a line break'],
    ["'use ' + 'strict';\n", 1, DIRECTIVE],
    ["export const value = 'a' + /* why */ 'b';\n", 1, DIRECTIVE],
    ["const x = 1;\nexport const value = (x + 'a') + 'b';\n", 2, PARENTHESIS],
    ["const x = 1;\nexport const value = 'a' + ('b' + x);\n", 2, PARENTHESIS],
  ])('leaves %j with a note', (text, line, reason) => {
    const fixed = applied(uselessConcatRecipe, text);

    expect(fixed.text).toBe(text);
    expect(fixed.notes).toEqual([leftNote(line, 'no-useless-concat', reason)]);
  });
});
