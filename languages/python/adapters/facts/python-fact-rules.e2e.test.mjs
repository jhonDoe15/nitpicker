import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { pythonE2eEnabled } from '../e2e/test-support/python-e2e-support.mjs';
import { createFactsProjects } from './test-support/facts-projects.mjs';

const DOC_RULE = 'doc-comment-content';
const MODULE = 'src/shop/mod.py';
const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function findingsOf(rule, files, options) {
  return factsOf(files, options)
    .findings()
    .filter((finding) => finding.rule === rule);
}

function docFindings(code) {
  return findingsOf(DOC_RULE, { [MODULE]: code }).map(({ identity, location }) => [
    identity,
    location.line,
  ]);
}

describe.skipIf(!pythonE2eEnabled)('doc-comment-content over docstrings', () => {
  it.each([
    ['a function', 'def load_user():\n    """Load the user."""\n', ['load_user']],
    [
      'stopwords and stems',
      'def load_users():\n    """Returns the loaded user."""\n',
      ['load_users'],
    ],
    ['a class', 'class OrderRepository:\n    """Repository of orders."""\n', ['OrderRepository']],
    ['a class called a class', 'class Order:\n    """Order class."""\n', ['Order']],
    [
      'a method, by its scope',
      'class A:\n    def total_price(self):\n        """The total price."""\n',
      ['A.total_price'],
    ],
    [
      'a docstring that adds a fact',
      'def load_user():\n    """Raises KeyError for an unknown id."""\n',
      [],
    ],
    ['a module docstring', '"""Users."""\n', []],
    [
      'an Args section that says more',
      'def get_user(user_id):\n    """Get the user.\n\n    Args:\n        user_id: Database key, not the login.\n    """\n',
      [],
    ],
    [
      'a one-line Returns section',
      'def get_user():\n    """Get the user.\n\n    Returns: The login name.\n    """\n',
      [],
    ],
    [
      'a :raises: field that says more',
      'def get_user():\n    """Get the user.\n\n    :raises KeyError: for an unknown id.\n    """\n',
      [],
    ],
    [
      'a bullet list that says more',
      'def get_user():\n    """Get the user.\n\n    - from the cache first\n    """\n',
      [],
    ],
    [
      'empty sections',
      'def get_user(user_id):\n    """Get the user.\n\n    :param user_id:\n    :returns:\n    """\n',
      ['get_user'],
    ],
  ])('restating: %s', (_name, code, qualifiers) => {
    expect(docFindings(code).map(([identity]) => identity)).toEqual(
      qualifiers.map((qualifier) => `doc-comment:${qualifier}:restating`),
    );
  });

  it('reports at the docstring line', () => {
    expect(docFindings('def load_user():\n\n    """Load the user."""\n')).toEqual([
      ['doc-comment:load_user:restating', 3],
    ]);
  });

  const docstring = (lines) => `def render():\n    """${lines.join('\n    ')}\n    """\n`;
  const longMessage = (lines) =>
    `This doc comment's description is ${String(lines)} lines (limit 5). Keep the non-obvious point, a unit, a limit or an edge case, and put the rest in names and types. ${exceptionHint(DOC_RULE, MODULE)}`;

  it('reports more than 5 description lines with the count', () => {
    const [finding, ...others] = findingsOf(DOC_RULE, {
      [MODULE]: docstring(['One.', 'Two.', 'Three.', '', 'Four.', 'Five.', 'Six.']),
    });

    expect(others).toEqual([]);
    expect([finding.identity, finding.path, finding.symbol, finding.location.line]).toEqual([
      'doc-comment:render:long',
      MODULE,
      'render',
      2,
    ]);
    expect(finding.message).toBe(longMessage(6));
  });

  it.each([
    ['5 lines', ['One.', 'Two.', 'Three.', 'Four.', 'Five.']],
    [
      'Google sections',
      ['One.', 'Two.', '', 'Args:', '    a: x.', '    b: y.', '    c: z.', 'Returns:', '    w.'],
    ],
    [
      ':param fields',
      ['One.', ':param a: x.', ':param b: y.', ':param c: z.', ':returns: w.', ':raises E: v.'],
    ],
    [
      'numpy sections',
      ['One.', '', 'Parameters', '----------', 'a : int', '    x.', 'b : int', '    y.'],
    ],
    ['doctest examples', ['One.', '>>> render()', "''", '>>> render()', "''", '>>> 1', '1']],
    [
      'a literal block',
      ['One.', 'Example::', '', '    a = 1', '    b = 2', '    c = 3', '    d = 4', '    e = 5'],
    ],
    [
      'a code-block directive',
      [
        'One.',
        '',
        '.. code-block:: python',
        '',
        '    a = 1',
        '    b = 2',
        '    c = 3',
        '    d = 4',
      ],
    ],
    [
      'a fenced block',
      ['One.', '', '```', 'a = 1', 'b = 2', 'c = 3', 'd = 4', 'e = 5', '```', 'Two.'],
    ],
    [
      'one-line sections',
      ['One.', 'Two.', 'Returns: x.', 'Raises ValueError: y.', 'Note: z.', 'more z.', 'and z.'],
    ],
  ])('does not count %s', (_name, lines) => {
    expect(docFindings(docstring(lines))).toEqual([]);
  });

  it.each([
    ['a bullet list', ['One.', '', '- a', '- b', '  more b', '* c', '1. d', '2) e'], 7],
    ['a note directive', ['One.', '', '.. note::', '', '    a', '    b', '    c', '    d'], 6],
    [
      'prose after a doctest',
      ['One.', '>>> render()', "''", '', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.'],
      6,
    ],
  ])('counts %s', (_name, lines, count) => {
    expect(
      findingsOf(DOC_RULE, { [MODULE]: docstring(lines) }).map(({ message }) => message),
    ).toEqual([longMessage(count)]);
  });
});

const TOTAL = [
  'def total(items, rate):',
  '    subtotal = sum(item.price * item.count for item in items)',
  '    discount = subtotal * rate if subtotal > 100 else 0',
  '    return round(subtotal - discount, 2)',
  '',
].join('\n');
const EDITED_TOTAL = TOTAL.replace(
  'round(subtotal - discount, 2)',
  'round(subtotal - discount, 3)',
);

describe.skipIf(!pythonE2eEnabled)('sibling-copy-edit over the base facts', () => {
  const siblingEdits = (files, options) =>
    findingsOf('sibling-copy-edit', files, options).map(({ path, identity }) => [path, identity]);

  it('reports an edit to one of two copies that leaves the other as it was', () => {
    const base = { 'src/shop/a.py': TOTAL, 'src/shop/b.py': TOTAL };

    expect(
      siblingEdits({ 'src/shop/a.py': EDITED_TOTAL, 'src/shop/b.py': TOTAL }, { base }),
    ).toEqual([['src/shop/a.py', 'sibling-copy:total']]);
    expect(siblingEdits({ 'src/shop/a.py': EDITED_TOTAL, 'src/shop/b.py': TOTAL })).toEqual([]);
    expect(
      siblingEdits({ 'src/shop/a.py': EDITED_TOTAL, 'src/shop/b.py': EDITED_TOTAL }, { base }),
    ).toEqual([]);
  });

  it('follows a moved file to its base copy', () => {
    const base = { 'src/shop/old.py': TOTAL, 'src/shop/b.py': TOTAL };
    const head = { 'src/shop/a.py': EDITED_TOTAL, 'src/shop/b.py': TOTAL };

    expect(siblingEdits(head, { base })).toEqual([]);
    expect(siblingEdits(head, { base, moves: [['src/shop/old.py', 'src/shop/a.py']] })).toEqual([
      ['src/shop/a.py', 'sibling-copy:total'],
    ]);
  });
});
