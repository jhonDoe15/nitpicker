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

  it('leaves test docstrings alone, as the TypeScript preset does in test files', () => {
    expect(
      findingsOf(DOC_RULE, {
        'tests/test_orders.py': 'def test_order_total():\n    """Test order total."""\n',
      }),
    ).toEqual([]);
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
    [
      'version directives, as JSDoc @since and @deprecated',
      [
        'One.',
        'Two.',
        'Three.',
        'Four.',
        '',
        '.. versionadded:: 2.0',
        '.. versionchanged:: 2.1',
        '    Takes a list.',
        '.. deprecated:: 3.0',
        '    Use draw.',
      ],
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

function rows(findings) {
  return findings.map(({ rule, path, identity }) => [rule, path, identity]);
}

const LOADS = 'def loads(text):\n    return text\n';
const OTHER_LOADS = 'def loads(text):\n    return text.strip()\n';

describe.skipIf(!pythonE2eEnabled)('exported-name-collision over imports', () => {
  const collisions = (importer) =>
    rows(
      findingsOf('exported-name-collision', {
        'src/app/__init__.py': '',
        'src/app/fast.py': LOADS,
        'src/app/pure.py': OTHER_LOADS,
        'src/app/use.py': importer,
      }),
    );

  it.each([
    [
      'a platform gate',
      'import sys\n\nif sys.platform == "win32":\n    from app.fast import loads\nelse:\n    from app.pure import loads\n',
    ],
    [
      'a try/except ImportError fallback',
      'try:\n    from app.fast import loads\nexcept ImportError:\n    from app.pure import loads\n',
    ],
    [
      'imports inside two functions',
      'def a(t):\n    from app.fast import loads\n    return loads(t)\n\n\ndef b(t):\n    from app.pure import loads\n    return loads(t)\n',
    ],
  ])('spares alternative implementations: %s', (_name, importer) => {
    expect(collisions(importer)).toEqual([]);
  });

  it('reports two module-level imports of the name', () => {
    expect(
      collisions('from app.fast import loads\nfrom app.pure import loads as pure_loads\n'),
    ).toEqual([
      ['exported-name-collision', 'src/app/fast.py', 'collision:loads'],
      ['exported-name-collision', 'src/app/pure.py', 'collision:loads'],
    ]);
  });
});

describe.skipIf(!pythonE2eEnabled)('duplicate-definition over overloads', () => {
  const overloaded = (body) =>
    `from typing import overload\n\n\n@overload\ndef get(key: str) -> str: ...\n@overload\ndef get(key: str, default: int) -> str | int: ...\ndef get(key, default=None):\n    ${body}\n`;

  it('compares the implementations, with the overload stubs folded in as TypeScript does', () => {
    const store = (first, second) =>
      findingsOf('duplicate-definition', {
        'src/app/__init__.py': '',
        'src/app/redis.py': overloaded(first),
        'src/app/memory.py': overloaded(second),
        'src/app/use.py': 'from app import memory, redis\n',
      });

    expect(store('return key', 'return default')).toEqual([]);
    expect(rows(store('return key', 'return key'))).toHaveLength(2);
  });
});

const DJANGO_APP = {
  'manage.py': 'import sys\n\nif __name__ == "__main__":\n    sys.exit(0)\n',
  'src/shop/__init__.py': '',
  'src/shop/admin.py': 'class OrderAdmin:\n    pass\n',
  'src/shop/templatetags/__init__.py': '',
  'src/shop/templatetags/money.py': 'def cents(value):\n    return value * 100\n',
  'src/shop/models.py': 'def upload_to(instance, name):\n    return name\n',
  'src/shop/migrations/__init__.py': '',
  'src/shop/migrations/0001_initial.py':
    'import shop.models\n\n\nclass Migration:\n    fields = [shop.models.upload_to]\n',
  'tests/test_shop.py':
    'from shop.admin import OrderAdmin\nfrom shop.models import upload_to\nfrom shop.templatetags.money import cents\nfrom app.plugins.csv_export import export\nfrom app.settings_names import WIDGET\n\n\ndef test_all():\n    assert OrderAdmin and upload_to and cents and export and WIDGET\n',
};

describe.skipIf(!pythonE2eEnabled)('test-only-export and modules a framework loads', () => {
  it('counts Django convention modules, migration and dotted-path references and importlib', () => {
    const findings = findingsOf('test-only-export', {
      ...DJANGO_APP,
      'src/app/__init__.py': '',
      'src/app/plugins/__init__.py':
        'import importlib\n\n\ndef load(name):\n    return importlib.import_module(f"app.plugins.{name}")\n',
      'src/app/plugins/csv_export.py': 'def export(rows):\n    return rows\n',
      'src/app/settings_names.py': 'WIDGET = 1\n',
      'src/app/settings.py': 'INSTALLED = ["app.settings_names.WIDGET"]\n',
      'src/app/main.py': 'from app.plugins import load\n\nload("csv_export")\n',
    });

    expect(rows(findings)).toEqual([]);
  });

  it('still reports a project module only the tests use', () => {
    expect(
      rows(
        findingsOf('test-only-export', {
          ...DJANGO_APP,
          'src/shop/helpers.py': 'def helper():\n    return 1\n',
          'tests/test_helpers.py':
            'from shop.helpers import helper\n\n\ndef test_h():\n    assert helper()\n',
        }),
      ),
    ).toEqual([['test-only-export', 'src/shop/helpers.py', 'files:src/shop/helpers.py']]);
  });
});

describe.skipIf(!pythonE2eEnabled)('sibling-copy-edit scope', () => {
  const COMMAND = TOTAL.replace('def total', 'class Command:\n    def handle');

  it('compares within one top-level package, and skips names a framework requires', () => {
    const base = {
      'src/blog/__init__.py': '',
      'src/blog/a.py': TOTAL,
      'src/blog/cmd.py': COMMAND,
      'src/shop/__init__.py': '',
      'src/shop/a.py': TOTAL,
      'src/shop/cmd.py': COMMAND,
      'src/shop/other_cmd.py': COMMAND,
    };
    const head = {
      ...base,
      'src/shop/a.py': EDITED_TOTAL,
      'src/shop/cmd.py': COMMAND.replace('2)', '3)'),
    };

    expect(findingsOf('sibling-copy-edit', head, { base })).toEqual([]);
    expect(
      rows(
        findingsOf(
          'sibling-copy-edit',
          { ...head, 'src/shop/b.py': TOTAL },
          { base: { ...base, 'src/shop/b.py': TOTAL } },
        ),
      ),
    ).toEqual([['sibling-copy-edit', 'src/shop/a.py', 'sibling-copy:total']]);
  });
});
