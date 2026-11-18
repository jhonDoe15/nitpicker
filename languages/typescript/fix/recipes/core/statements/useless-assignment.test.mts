import { describe, expect, it } from 'vitest';
import { applied } from '../test-support/apply-recipe.mts';
import { uselessAssignmentRecipe } from './useless-assignment.mts';

function body(statements: string): string {
  return `declare function read(): number;\nexport function run(flag: boolean): number {\n${statements}\n}\n`;
}

describe('uselessAssignmentRecipe', () => {
  it.each([
    [
      '  let value = 0;\n  value = read();\n  return value;',
      '  let value;\n  value = read();\n  return value;',
    ],
    [
      '  let value: number = 0;\n  value = read();\n  return value;',
      '  let value: number;\n  value = read();\n  return value;',
    ],
    [
      '  let value = 0;\n  value = 1;\n  value = 2;\n  return value;',
      '  let value;\n  value = 2;\n  return value;',
    ],
    [
      '  let options = { retries: 1, labels: [] };\n  if (flag) {\n    options = { retries: 2, labels: [] };\n  }\n  options = { retries: 3, labels: [] };\n  return options.retries;',
      '  let options;\n  if (flag) {\n  }\n  options = { retries: 3, labels: [] };\n  return options.retries;',
    ],
  ])('drops the dead store in %j', (from, to) => {
    expect(applied(uselessAssignmentRecipe, body(from))).toEqual({ text: body(to), notes: [] });
  });

  it.each([
    ['  let value = read();\n  value = read();\n  return value;', 'may have effects'],
    [
      '  let value = read();\n  let other = (value = 2);\n  value = 3;\n  return value + other;',
      'not a plain assignment',
    ],
  ])('leaves %j with a note', (statements, reason) => {
    const fixed = applied(uselessAssignmentRecipe, body(statements));

    expect(fixed.text).toBe(body(statements));
    expect(fixed.notes).toEqual(expect.arrayContaining([expect.stringContaining(reason)]));
  });
});
