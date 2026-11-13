import { describe, expect, it } from 'vitest';
import { pythonRestatingDocstringRecipe as recipe } from './restating-docstring.mjs';

function apply(text, comments, inputs = {}) {
  const { fixes } = recipe.plan({
    files: [{ path: 'shop/a.py', text }],
    inputs: { pythonDocstrings: { 'shop/a.py': comments }, ...inputs },
  });
  const edits = fixes.flatMap((fix) => fix.edits).sort((left, right) => right.start - left.start);
  return {
    fixes,
    text: edits.reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    ),
  };
}

function comment(name, line, extra = {}) {
  return {
    name,
    line,
    span: [line, line],
    only: false,
    lines: [`${name}.`],
    detailed: false,
    ...extra,
  };
}

const SOURCE = `def get_total(items):
    """Get total."""
    return sum(items)


class Cart:
    """Holds the items a customer put aside for later, in order."""

    def clear(self):
        """Clear."""
        self.items = []

    def empty(self):
        """Empty."""
`;

describe('pythonRestatingDocstringRecipe', () => {
  it('is a review recipe for the python preset and the facts rule', () => {
    expect([recipe.presets, recipe.safety, recipe.scope, recipe.rules]).toEqual([
      ['python'],
      'review',
      'file',
      [{ tool: 'facts', rule: 'doc-comment-content' }],
    ]);
  });

  it('deletes the lines of a docstring that only restates the name', () => {
    const { fixes, text } = apply(SOURCE, [
      comment('get_total', 2, { lines: ['Get total.'] }),
      comment('Cart', 7, { lines: ['Holds the items a customer put aside for later, in order.'] }),
      comment('clear', 10, { lines: ['Clear.'] }),
    ]);

    expect(text).toBe(
      SOURCE.replace('    """Get total."""\n', '').replace('        """Clear."""\n', ''),
    );
    expect(fixes.map(({ finding }) => finding)).toEqual([
      { tool: 'facts', rule: 'doc-comment-content', path: 'shop/a.py', line: 2 },
      { tool: 'facts', rule: 'doc-comment-content', path: 'shop/a.py', line: 10 },
    ]);
  });

  it('replaces a docstring that is the whole body with pass', () => {
    const { text } = apply(SOURCE, [comment('empty', 14, { only: true })]);

    expect(text).toBe(SOURCE.replace('        """Empty."""\n', '        pass\n'));
  });

  it('keeps a docstring with sections that say more', () => {
    expect(apply(SOURCE, [comment('clear', 10, { detailed: true })]).fixes).toEqual([]);
  });

  it('declines a docstring that shares its line, and a file an exception covers', () => {
    const inline = 'def f(): """F."""\n';

    expect(apply(inline, [comment('f', 1)]).fixes).toEqual([]);
    expect(apply(SOURCE, [comment('clear', 10)], { isExcepted: () => true }).fixes).toEqual([]);
  });

  it.each([
    'def f():\n    """F."""; x = "a"\n',
    "def f():\n    '''F.'''; x = 'a'\n",
    'def f():\n    "F." "more"\n',
    'def f():\n    """F."""  # note\n',
  ])('declines a docstring that shares its statement: %j', (text) => {
    expect(apply(text, [comment('f', 2, { span: [2, 2] })]).fixes).toEqual([]);
  });

  it('deletes docstrings with escapes, prefixes and several lines', () => {
    const text = 'def f():\n    r"""F \\""" ok\n    more"""\n    return 1\n';

    expect(apply(text, [comment('f', 2, { span: [2, 3] })]).text).toBe('def f():\n    return 1\n');
  });

  it('keeps the line endings of a CRLF file', () => {
    const text = 'def empty():\r\n    """Empty."""\r\n';

    expect(apply(text, [comment('empty', 2, { only: true })]).text).toBe(
      'def empty():\r\n    pass\r\n',
    );
  });

  it('plans nothing for a file with no scan result', () => {
    expect(recipe.plan({ files: [{ path: 'a.py', text: '' }], inputs: {} }).fixes).toEqual([]);
  });
});
