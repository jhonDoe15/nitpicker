import { describe, expect, it } from 'vitest';
import { pythonCommentedCodeRecipe as recipe } from '../typed/recipe-views.mts';
import type { TextEdit } from '../typed/recipe-views.mts';

const NAME = 'shop/a.py';

function apply(text: string, lines: number[], inputs: object = {}) {
  const { fixes } = recipe.plan({
    files: [{ path: NAME, text }],
    read: () => text,
    projectRoot: '/',
    accepts: () => true,
    inputs: { pythonCommentedCode: { [NAME]: { text, lines } }, ...inputs },
  });
  const edits = fixes
    .flatMap((fix) => fix.edits)
    .sort((left: TextEdit, right: TextEdit) => right.start - left.start);
  return {
    fixes,
    text: edits.reduce(
      (result: string, edit: TextEdit) =>
        result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    ),
  };
}

describe('pythonCommentedCodeRecipe', () => {
  it('is an automatic recipe for the python preset and ruff ERA001', () => {
    expect([recipe.presets, recipe.safety, recipe.scope, recipe.rules]).toEqual([
      ['python'],
      'safe',
      'file',
      [{ tool: 'ruff', rule: 'ERA001' }],
    ]);
  });
  it('deletes the reported lines and keeps the sentence above them', () => {
    const text = [
      'def total(items):',
      '    # Disabled until the cache is warm.',
      '    # cache = warm(items)',
      '    # print(cache)',
      '    return sum(items)',
      '',
    ].join('\n');
    const { fixes, text: result } = apply(text, [3, 4]);

    expect(result).toBe(
      'def total(items):\n    # Disabled until the cache is warm.\n    return sum(items)\n',
    );
    expect(fixes.map(({ finding }) => finding)).toEqual([
      { tool: 'ruff', rule: 'ERA001', path: NAME, line: 3 },
    ]);
  });
  it('deletes a whole commented-out block, headers and bodies together', () => {
    const text =
      'def f(retries):\n    # if retries:\n    #     foo()\n    # else:\n    #     bar()\n    return 1\n';

    expect(apply(text, [3, 5]).text).toBe('def f(retries):\n    return 1\n');
  });
  it('reports one fix for a block at the first reported line', () => {
    const { fixes } = apply('# if retries:\n#     foo()\n#     bar()\nx = 1\n', [2, 3]);

    expect(fixes.map(({ finding }) => finding.line)).toEqual([2]);
  });
  it('deletes a reported line in a file without a final newline', () => {
    expect(apply('x = 1\n# y = compute(2)', [2]).text).toBe('x = 1\n');
  });
  it('deletes a commented-out import', () => {
    expect(apply('# import os\nx = 1\n', [1]).text).toBe('x = 1\n');
  });
  it.each([
    ['a directive', '# noqa: E501\nx = 1\n', [1]],
    ['a type comment', '# type: ignore\nx = 1\n', [1]],
    ['a pragma', '# pragma: no cover\nx = 1\n', [1]],
    ['a formatter switch', '# fmt: off\nx = 1\n', [1]],
    ['a pyright directive', '# pyright: basic\nx = 1\n', [1]],
    ['a mypy directive', '# mypy: ignore-errors\nx = 1\n', [1]],
    ['a ruff directive', '# ruff: noqa\nx = 1\n', [1]],
    ['an isort directive', '# isort: skip_file\nx = 1\n', [1]],
    ['a pylint directive', '# pylint: disable=unused-import\nx = 1\n', [1]],
    ['a shebang', '#!/usr/bin/env python\nx = 1\n', [1]],
    ['an encoding header', '# -*- coding: utf-8 -*-\nx = 1\n', [1]],
    ['a licence header', '# Copyright (c) 2024 Example (all rights)\nx = 1\n', [1]],
    ['a trailing comment', 'x = 1  # y = 2\n', [1]],
    ['a statement that may be prose', '# return null\nx = 1\n', [1]],
    ['a call-like sentence', '# return value (cached)\nx = 1\n', [1]],
    ['a sentence about an assignment', '# retries = 3 attempts\nx = 1\n', [1]],
    ['a block whose tail is prose', '# y = compute(2)\n# then we restart the worker\nx = 1\n', [1]],
    ['a pytype directive', '# pytype: disable=attribute-error\nx = 1\n', [1]],
    ['a cython directive', '# cython: language_level=3\nx = 1\n', [1]],
    ['a semgrep marker', '# nosemgrep: rule\nx = 1\n', [1]],
    ['a directive after code', '# y = compute(2)  # noqa: E501\nx = 1\n', [1]],
    ['a docstring', 'def f():\n    """y = 2"""\n', [2]],
    ['a line ruff did not report', '# x = 1\ny = 2\n', []],
    ['a line past the end', 'x = 1\n', [9]],
  ])('declines %s', (_name, text, lines) => {
    expect(apply(text, lines).text).toBe(text);
  });
  it('declines a file that changed since ruff read it', () => {
    const { fixes } = recipe.plan({
      files: [{ path: NAME, text: '# x = 1\ny = 2\n' }],
      read: () => undefined,
      projectRoot: '/',
      accepts: () => true,
      inputs: { pythonCommentedCode: { [NAME]: { text: 'old\n', lines: [1] } } },
    });

    expect(fixes).toEqual([]);
  });
  it('declines a file the configuration excepts', () => {
    const text = '# x = foo(1)\ny = 2\n';

    expect(apply(text, [1], { isExcepted: () => true }).text).toBe(text);
  });
});
