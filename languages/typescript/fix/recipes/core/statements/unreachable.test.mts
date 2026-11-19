import { describe, expect, it } from 'vitest';
import { applied, leftNote } from '../test-support/apply-recipe.mts';
import { unreachableRecipe } from './unreachable.mts';

const DECLARATION = 'a declaration in it is a pattern or is used from reachable code';

describe('unreachableRecipe', () => {
  it.each([
    [
      'deletes the statements after a return',
      'export function run(): number {\n  return 1;\n  console.log(1);\n  console.log(2);\n}\n',
      'export function run(): number {\n  return 1;\n}\n',
    ],
    [
      'keeps a hoisted function after a return',
      'export function run(): number {\n  return helper();\n  console.log(1);\n  function helper(): number {\n    return 2;\n  }\n}\n',
      'export function run(): number {\n  return helper();\n  function helper(): number {\n    return 2;\n  }\n}\n',
    ],
    [
      'keeps the name of a var that reachable code reads',
      'export function run(): unknown {\n  const seen = typeof later;\n  return seen;\n  var later = 1;\n}\n',
      'export function run(): unknown {\n  const seen = typeof later;\n  return seen;\n  var later;\n}\n',
    ],
    [
      'deletes the statements after a throw in a loop',
      'export function run(items: number[]): void {\n  for (const item of items) {\n    continue;\n    if (item) {\n      throw new Error();\n    }\n  }\n}\n',
      'export function run(items: number[]): void {\n  for (const item of items) {\n    continue;\n  }\n}\n',
    ],
  ])('%s', (_name, text, output) => {
    expect(applied(unreachableRecipe, text)).toEqual({ text: output, notes: [] });
  });

  it.each([
    [
      'export function run(): () => number {\n  const read = () => value;\n  return read;\n  const value = 1;\n}\n',
      4,
      DECLARATION,
    ],
    [
      'export function run(): number {\n  return 1;\n  console.log(1);\n  // later\n  console.log(2);\n}\n',
      3,
      'the unreachable code holds a comment',
    ],
    ['export function run(): number {\n  return 1;\n  var { a } = { a: 1 };\n}\n', 3, DECLARATION],
  ])('leaves %j with a note', (text, line, reason) => {
    const fixed = applied(unreachableRecipe, text);

    expect(fixed.text).toBe(text);
    expect(fixed.notes).toEqual([leftNote(line, 'no-unreachable', reason)]);
  });
});
