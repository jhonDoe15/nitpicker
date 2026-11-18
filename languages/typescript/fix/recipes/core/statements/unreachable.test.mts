import { describe, expect, it } from 'vitest';
import { applied } from '../test-support/apply-recipe.mts';
import { unreachableRecipe } from './unreachable.mts';

describe('unreachableRecipe', () => {
  it('deletes the statements after a return', () => {
    const text =
      'export function run(): number {\n  return 1;\n  console.log(1);\n  console.log(2);\n}\n';

    expect(applied(unreachableRecipe, text)).toEqual({
      text: 'export function run(): number {\n  return 1;\n}\n',
      notes: [],
    });
  });

  it('keeps a hoisted function after a return', () => {
    const text =
      'export function run(): number {\n  return helper();\n  console.log(1);\n  function helper(): number {\n    return 2;\n  }\n}\n';

    expect(applied(unreachableRecipe, text).text).toBe(
      'export function run(): number {\n  return helper();\n  function helper(): number {\n    return 2;\n  }\n}\n',
    );
  });

  it('keeps the name of a var that reachable code reads', () => {
    const text =
      'export function run(): unknown {\n  const seen = typeof later;\n  return seen;\n  var later = 1;\n}\n';

    expect(applied(unreachableRecipe, text).text).toBe(
      'export function run(): unknown {\n  const seen = typeof later;\n  return seen;\n  var later;\n}\n',
    );
  });

  it('deletes the statements after a throw in a loop', () => {
    const text =
      'export function run(items: number[]): void {\n  for (const item of items) {\n    continue;\n    if (item) {\n      throw new Error();\n    }\n  }\n}\n';

    expect(applied(unreachableRecipe, text).text).toBe(
      'export function run(items: number[]): void {\n  for (const item of items) {\n    continue;\n  }\n}\n',
    );
  });

  it.each([
    [
      'export function run(): () => number {\n  const read = () => value;\n  return read;\n  const value = 1;\n}\n',
      'used from reachable code',
    ],
    [
      'export function run(): number {\n  return 1;\n  console.log(1);\n  // later\n  console.log(2);\n}\n',
      'a comment',
    ],
    ['export function run(): number {\n  return 1;\n  var { a } = { a: 1 };\n}\n', 'a pattern'],
  ])('leaves %j with a note', (text, reason) => {
    const fixed = applied(unreachableRecipe, text);

    expect(fixed.text).toBe(text);
    expect(fixed.notes).toEqual([expect.stringContaining(reason)]);
  });
});
