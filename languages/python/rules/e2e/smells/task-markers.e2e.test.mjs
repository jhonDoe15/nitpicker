import { afterEach, describe, expect, it } from 'vitest';
import { taskMarkerCases } from '../../../../../shared/naming/test-support/task-marker-cases.mjs';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, verdicts } = createScripts();
afterEach(cleanup);

const asComment = (text) =>
  `${text
    .split('\n')
    .map((line) => `# ${line}`)
    .join('\n')}\nX = 1\n`;
const asDocstring = (text) =>
  `def f():\n    """\n${text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')}\n    """\n    return 1\n`;
const FORMS = { comment: asComment, docstring: asDocstring };

const reported = (found) => found.some((entry) => entry.startsWith('todo-without-issue:'));

describe.skipIf(!enabled)('todo-without-issue', () => {
  it.each(Object.entries(FORMS))('judges the shared marker cases in a %s', (_form, wrap) => {
    const rows = [...taskMarkerCases('python', true), ...taskMarkerCases('python', false)];
    const found = verdicts(Object.fromEntries(rows.map((row) => [row.name, wrap(row.text)])));
    const actual = Object.fromEntries(rows.map((row) => [row.name, reported(found[row.name])]));
    const expected = Object.fromEntries(rows.map((row) => [row.name, row.reported]));

    expect(actual).toEqual(expected);
  });

  it('flags a task marker that names no issue', () => {
    const [actual, expected] = outcomes([
      ['TODO', 'X = 1  # TODO: later\n', ['todo-without-issue:1 TODO: later']],
      ['FIXME', '# FIXME this\nX = 1\n', ['todo-without-issue:1 FIXME this']],
      ['HACK', '# HACK: temporary\nX = 1\n', ['todo-without-issue:1 HACK: temporary']],
      ['XXX', '# XXX: check\nX = 1\n', ['todo-without-issue:1 XXX: check']],
      [
        'TODO with a name',
        '# TODO(alice): later\nX = 1\n',
        ['todo-without-issue:1 TODO(alice): later'],
      ],
      ['TODO(#123)', '# TODO(#123): later\nX = 1\n', []],
      ['TODO(PROJ-123)', '# TODO(PROJ-123): later\nX = 1\n', []],
      ['TODO PROJ-123', '# TODO PROJ-123 later\nX = 1\n', []],
      ['TODO with a link', '# TODO: https://example.com/issues/1\nX = 1\n', []],
      [
        'SHA-256 is no issue',
        '# TODO: SHA-256 later\nX = 1\n',
        ['todo-without-issue:1 TODO: SHA-256 later'],
      ],
      ['prose', '# the todo list is long\nX = 1\n', []],
      ['lowercase', '# todo: handle refunds\nX = 1\n', []],
      ['capitalized', '# Todo handle refunds\nX = 1\n', []],
      ['trailing', '# handle refunds later TODO\nX = 1\n', []],
      ['a number reference', '# TODO(#0): handle refunds\nX = 1\n', []],
      [
        'a hash without a number',
        '# TODO(#): handle refunds\nX = 1\n',
        ['todo-without-issue:1 TODO(#): handle refunds'],
      ],
      [
        'a second marker without a reference',
        '# TODO(#1) done here, FIXME: unreferenced second marker\nX = 1\n',
        ['todo-without-issue:1 TODO(#1) done here, FIXME: unreferenced second mar'],
      ],
      ['prose that starts with Hack', '# Hack to embed the traceback text\nX = 1\n', []],
      ['prose that starts with xxx', '# xxx is a placeholder name here\nX = 1\n', []],
      [
        'a docstring',
        'def f():\n    """TODO: implement this properly."""\n    return 1\n',
        ['todo-without-issue:2 TODO: implement this properly.'],
      ],
      [
        'a capitalized Todo in a docstring',
        'def f():\n    """Todo list items"""\n    return 1\n',
        [],
      ],
      [
        'a NotImplementedError message',
        'def f():\n    raise NotImplementedError("TODO")\n',
        ['todo-without-issue:2 TODO'],
      ],
      ['a word that contains it', '# AUTODOC: later\nX = 1\n', []],
      ['a marker inside a string', 'X = "TODO: later"\n', []],
    ]);
    expect(actual).toEqual(expected);
  });
});
