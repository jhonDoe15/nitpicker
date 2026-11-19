import { describe, expect, it } from 'vitest';
import { applied, leftNote } from '../test-support/apply-recipe.mts';
import { uselessAssignmentRecipe } from './useless-assignment.mts';

function body(statements: string): string {
  return `declare function read(): number;\nexport function run(flag: boolean): number {\n${statements}\n}\n`;
}

const RULE = 'no-useless-assignment';
const EFFECTS = 'the stored value may have effects, so removing it is for a person to decide';

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
    ['  let value = read();\n  value = read();\n  return value;', [leftNote(3, RULE, EFFECTS)]],
    [
      '  let value = read();\n  let other = (value = 2);\n  value = 3;\n  return value + other;',
      [
        leftNote(3, RULE, EFFECTS),
        leftNote(4, RULE, 'the store is not a plain assignment statement or declaration'),
      ],
    ],
    [
      '  let value = read();\n  if (value > 0) value = 1;\n  value = 2;\n  return value;',
      [leftNote(4, RULE, 'the assignment is the only statement of a branch or loop')],
    ],
  ])('leaves %j with a note', (statements, notes) => {
    const fixed = applied(uselessAssignmentRecipe, body(statements));

    expect(fixed.text).toBe(body(statements));
    expect(fixed.notes).toEqual(notes);
  });
});
