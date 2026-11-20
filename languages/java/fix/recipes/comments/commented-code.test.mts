import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../kotlin/test-support/apply-recipe.mts';
import { javaCommentedCodeRecipe } from './commented-code.mts';

const MAIN = 'src/main/java/demo/A.java';

function apply(text: string, path: string = MAIN): string {
  return applyRecipe(javaCommentedCodeRecipe, text, path);
}

describe('javaCommentedCodeRecipe', () => {
  it('deletes a group of commented-out lines with their lines', () => {
    const text =
      'class A {\n    void f() {\n        // int x = compute(1);\n        // x.run();\n        return;\n    }\n}\n';

    expect(apply(text)).toBe('class A {\n    void f() {\n        return;\n    }\n}\n');
    expect(plannedLines(javaCommentedCodeRecipe, text, MAIN)).toEqual([3]);
  });
  it('deletes only the code of a block that mixes a sentence and code', () => {
    const text =
      'class A {\n    // Disabled until the cache is warm.\n    // int x = compute(1);\n    // if (x > 1) {\n    //     x = 2;\n    // }\n    int y;\n}\n';

    expect(apply(text)).toBe(
      'class A {\n    // Disabled until the cache is warm.\n    int y;\n}\n',
    );
  });
  it('deletes a trailing comment and the spaces before it', () => {
    expect(apply('class A { int a = 1; // int b = compute(2);\n}\n')).toBe(
      'class A { int a = 1;\n}\n',
    );
  });
  it('deletes a block comment of code', () => {
    expect(
      apply('class A {\n    /*\n     * int x = 1;\n     * x = foo(x);\n     */\n    int y;\n}\n'),
    ).toBe('class A {\n    int y;\n}\n');
  });
  it.each([
    [
      'class A { int f() { return/* int x = compute(1); */y; } }\n',
      'class A { int f() { return y; } }\n',
    ],
    [
      'class A { int f() { return 1-/* int x = compute(1); */-y; } }\n',
      'class A { int f() { return 1- -y; } }\n',
    ],
    [
      'class A { int f() { return 1 /* int x = compute(1); */ + y; } }\n',
      'class A { int f() { return 1 + y; } }\n',
    ],
  ])('keeps the neighbours of a block comment apart (%j)', (text, expected) => {
    expect(apply(text)).toBe(expected);
  });
  it('also cleans test sources', () => {
    expect(apply('class T {\n    // int x = foo(1);\n}\n', 'src/test/java/demo/T.java')).toBe(
      'class T {\n}\n',
    );
  });
  it.each([
    '// This explains the choice below\nclass A {}\n',
    '/** int x = 1; */\nclass A {}\n',
    '// TODO(#12): int x = 1;\nclass A {}\n',
    '// CHECKSTYLE:OFF\nclass A {}\n',
    '// NOSONAR\nclass A {}\n',
    '//noinspection unchecked\nclass A {}\n',
    '// @formatter:off\nclass A {}\n',
    '// language=SQL\nclass A {}\n',
    '/* Copyright 2024 Example\n * Licensed under the Apache License */\nclass A {}\n',
    'class A { int a = 1; // int b = 2; // NOSONAR\n}\n',
    '// service.send(order, true);\nclass A {}\n',
    '// int x = 1;\n// then we restart the worker\nclass A {}\n',
    '// return value is cached;\nclass A {}\n',
    'class A { void f() { g(/* int x = 1 */); } }\n',
    'class A {\n    /* int x = 1;\n       is the old default */\n}\n',
    'String s = "// int x = 1;";\n',
  ])('declines a comment that may be prose or a directive (%j)', (text) => {
    expect(apply(text)).toBe(text);
  });
  it('ignores other file types', () => {
    const text = '// int x = 1;\n';

    expect(apply(text, 'src/main/kotlin/demo/A.kt')).toBe(text);
  });
});
