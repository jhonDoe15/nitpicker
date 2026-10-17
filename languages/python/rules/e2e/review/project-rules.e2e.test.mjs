import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf, reportOf } = createScripts();
afterEach(cleanup);

const only = (rule, files) => findingsOf(files).filter((finding) => finding.startsWith(`${rule} `));
const dataOf = (rule, files) =>
  reportOf(files)
    .filter((entry) => entry.rule === rule)
    .map(({ subject, data }) => [subject, data]);

const STATUS = `import enum


class Status(enum.Enum):
    NEW = 1
    PAID = 2
    SHIPPED = 3
`;

describe.skipIf(!enabled)('exhaustive-enum-predicate', () => {
  const predicates = (code, extra = {}) =>
    dataOf('exhaustive-enum-predicate', { 'shop/status.py': STATUS + code, ...extra });

  it.each([
    [
      'a returned or-chain of some members',
      'def is_open(s: Status) -> bool:\n    return s == Status.NEW or s == Status.PAID\n',
      [['is_open Status', { union: 'Status' }]],
    ],
    [
      'an and-chain of is not, assigned',
      'def f(s: Status) -> None:\n    closed = s is not Status.NEW and s is not Status.PAID\n',
      [['f Status', { union: 'Status' }]],
    ],
    [
      'a membership test of every member',
      'def known(s: Status) -> bool:\n    return s in (Status.NEW, Status.PAID, Status.SHIPPED)\n',
      [],
    ],
    [
      'every member but an alias',
      'class Mode(enum.Enum):\n    A = 1\n    B = 2\n    C = 3\n    DEFAULT = A\n    OTHER = 2\n\n\ndef f(m: Mode) -> bool:\n    return m in (Mode.A, Mode.B, Mode.C)\n',
      [],
    ],
    [
      'some members next to an alias',
      'class Mode(enum.Enum):\n    A = 1\n    B = 2\n    C = 3\n    DEFAULT = A\n\n\ndef f(m: Mode) -> bool:\n    return m in (Mode.A, Mode.DEFAULT)\n',
      [],
    ],
    [
      'a negated list of every member',
      'def f(s: Status) -> bool:\n    return s != Status.NEW and s != Status.PAID and s != Status.SHIPPED\n',
      [],
    ],
    [
      'a predicate inside not and a conditional',
      'def f(s: Status, x: bool) -> bool:\n    return not (s == Status.NEW or s == Status.PAID) if x else x\n',
      [['f Status', { union: 'Status' }]],
    ],
    [
      'a lambda body',
      'OPEN = lambda s: s in {Status.NEW, Status.PAID}\n',
      [['Status', { union: 'Status' }]],
    ],
    [
      'a Literal alias parameter',
      'from typing import Literal\nKind = Literal["a", "b", "c"]\ndef f(k: Kind | None) -> bool:\n    return k == "a" or k == "b"\n',
      [['f Kind', { union: 'Kind' }]],
    ],
    [
      'an if condition',
      'def f(s: Status) -> int:\n    if s == Status.NEW or s == Status.PAID:\n        return 1\n    return 0\n',
      [],
    ],
    ['a single membership value', 'def f(s: Status) -> bool:\n    return s in (Status.NEW,)\n', []],
    [
      'one member compared twice',
      'def f(s: Status) -> bool:\n    return s == Status.NEW or s == Status.NEW\n',
      [],
    ],
    [
      'two different subjects',
      'def f(s: Status, t: Status) -> bool:\n    return s == Status.NEW or t == Status.PAID\n',
      [],
    ],
    [
      'a type guard',
      'def f(s: object) -> TypeGuard[Status]:\n    return s == Status.NEW or s == Status.PAID\n',
      [],
    ],
    [
      'a library enum',
      'from http import HTTPStatus\ndef f(s: HTTPStatus) -> bool:\n    return s == HTTPStatus.OK or s == HTTPStatus.CREATED\n',
      [],
    ],
  ])('%s', (_name, code, expected) => {
    expect(predicates(code)).toEqual(expected);
  });

  it('skips an enum of two members', () => {
    const two = 'import enum\nclass Side(enum.Enum):\n    LEFT = 1\n    RIGHT = 2\n';
    expect(
      predicates('', {
        'shop/side.py': `${two}def f(s: Side) -> bool:\n    return s == Side.LEFT or s == Side.RIGHT\n`,
      }),
    ).toEqual([]);
  });

  it('finds an enum imported from another project module', () => {
    expect(
      only('exhaustive-enum-predicate', {
        'shop/__init__.py': '',
        'shop/status.py': STATUS,
        'shop/orders.py':
          'from shop import status\nfrom .status import Status\n\n\ndef f(s: Status) -> bool:\n    return s is status.Status.NEW or s is Status.PAID\n',
      }),
    ).toEqual(['exhaustive-enum-predicate shop/orders.py:6 f Status']);
  });
});

const PRICING =
  'def compute(amount: int, rate: int = 2, *, cents: bool = False) -> int:\n    return amount\n';

describe.skipIf(!enabled)('forwarding-wrapper', () => {
  const wrappers = (code, extra = {}) =>
    dataOf('forwarding-wrapper', { 'shop/pricing.py': PRICING, 'shop/api.py': code, ...extra });
  const IMPORT = 'from shop.pricing import compute\n\n\n';

  it.each([
    [
      'a public wrapper of an imported function',
      `${IMPORT}def total(amount: int, rate: int = 2, *, cents: bool = False) -> int:\n    """Total."""\n    return compute(amount, rate, cents=cents)\n`,
      [['total', { target: 'compute', module: 'shop.pricing', exported: true }]],
    ],
    [
      'a private wrapper through the module',
      'from shop import pricing\n\n\ndef _total(amount: int, rate: int = 2, *, cents: bool = False) -> int:\n    return pricing.compute(amount, rate, cents=cents)\n',
      [['_total', { target: 'compute', module: 'shop.pricing', exported: false }]],
    ],
    [
      'a wrapper of a function in the same module',
      'def g(*args: int, **kwargs: str) -> int:\n    return 0\n\n\ndef f(*args: int, **kwargs: str) -> int:\n    return g(*args, **kwargs)\n',
      [['f', { target: 'g', module: null, exported: true }]],
    ],
    [
      'another default',
      `${IMPORT}def total(amount: int, rate: int = 3, *, cents: bool = False) -> int:\n    return compute(amount, rate, cents=cents)\n`,
      [],
    ],
    [
      'other parameter types',
      `${IMPORT}def total(amount: float, rate: int = 2, *, cents: bool = False) -> int:\n    return compute(amount, rate, cents=cents)\n`,
      [],
    ],
    [
      'reordered arguments',
      'def g(a: int, b: int) -> int:\n    return a\n\n\ndef f(a: int, b: int) -> int:\n    return g(b, a)\n',
      [],
    ],
    ['no annotations', 'def g(a, b):\n    return a\n\n\ndef f(a, b):\n    return g(a, b)\n', []],
    [
      'more work than the call',
      'def g(a: int) -> int:\n    return a\n\n\ndef f(a: int) -> int:\n    return g(a) + 1\n',
      [],
    ],
    [
      'a decorated or async wrapper',
      'def g(a: int) -> int:\n    return a\n\n\n@cache\ndef f(a: int) -> int:\n    return g(a)\n\n\nasync def h(a: int) -> int:\n    return g(a)\n',
      [],
    ],
    [
      'a method',
      'def g(a: int) -> int:\n    return a\n\n\nclass A:\n    def f(self, a: int) -> int:\n        return g(a)\n',
      [],
    ],
    [
      'a library function',
      'from os import getenv\n\n\ndef f(key: str) -> str | None:\n    return getenv(key)\n',
      [],
    ],
  ])('%s', (_name, code, expected) => {
    expect(wrappers(code)).toEqual(expected);
  });
});

const TOTAL =
  'def total(amount: int, rate: int = 2, *, cents: bool = False) -> int:\n    return amount\n';
const PUBLISHED = '[project]\nname = "shop"\n[build-system]\nbuild-backend = "hatchling.build"\n';

describe.skipIf(!enabled)('unused-option', () => {
  const unused = (files) =>
    only('unused-option', { 'shop/__init__.py': '', 'shop/pricing.py': TOTAL, ...files }).map(
      (finding) => finding.split(' ').at(-1),
    );

  it.each([
    ['a call that passes nothing', 'total(1)', ['total.cents', 'total.rate']],
    ['a positional argument', 'total(1, 3)', ['total.cents']],
    ['keyword arguments', 'total(1, rate=3, cents=True)', []],
    ['a spread of positional arguments', 'total(*values)', ['total.cents']],
    ['a spread of keyword arguments', 'total(1, **options)', []],
  ])('%s', (_name, call, expected) => {
    expect(
      unused({
        'shop/app.py': `from shop.pricing import total\n\n\ndef run():\n    return ${call}\n`,
      }),
    ).toEqual(expected);
  });

  it('reports at the parameter with the private scope', () => {
    expect(
      dataOf('unused-option', {
        'shop/pricing.py': TOTAL,
        'shop/app.py': 'from shop.pricing import total\n\n\ndef run():\n    return total(1, 2)\n',
      }),
    ).toEqual([['total.cents', { scope: 'private' }]]);
  });

  it('follows aliases, module attributes and package re-exports', () => {
    expect(
      unused({
        'shop/__init__.py': 'from .pricing import total as price\n',
        'shop/a.py': 'from shop import price\nprice(1, rate=2)\n',
        'shop/b.py': 'import shop.pricing as p\np.total(1)\n',
      }),
    ).toEqual(['total.cents']);
  });

  it('does not count tests as callers of a private package', () => {
    const files = {
      'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
      'tests/test_pricing.py': 'from shop.pricing import total\ntotal(1, rate=2, cents=True)\n',
    };
    expect(unused(files)).toEqual(['total.cents', 'total.rate']);
    expect(unused({ ...files, 'pyproject.toml': PUBLISHED })).toEqual([]);
  });

  it.each([
    ['nothing calls it', { 'shop/app.py': 'import shop\n' }],
    [
      'it is used as a value',
      { 'shop/app.py': 'from shop.pricing import total\ntotal(1)\nhandlers = [total]\n' },
    ],
    [
      'a star import hides its callers',
      { 'shop/app.py': 'from shop.pricing import *\nfrom shop.pricing import total\ntotal(1)\n' },
    ],
    [
      'the main guard calls it',
      {
        'shop/app.py': 'from shop.pricing import total\nif __name__ == "__main__":\n    total(1)\n',
      },
    ],
    [
      'it is a declared entry point',
      {
        'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
        'pyproject.toml':
          '[project]\nname = "shop"\n[project.scripts]\nprice = "shop.pricing:total"\n',
      },
    ],
    [
      'a __main__.py calls it',
      { 'shop/__main__.py': 'import sys\nfrom shop.pricing import total\nsys.exit(total(1))\n' },
    ],
    [
      'a [project.entry-points] group names it',
      {
        'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
        'pyproject.toml':
          '[project]\nname = "shop"\n[project.entry-points."shop.plugins"]\nprice = "shop.pricing:total"\n',
      },
    ],
    [
      'setup.cfg names it',
      {
        'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
        'setup.cfg': '[options.entry_points]\nconsole_scripts =\n    price = shop.pricing:total\n',
      },
    ],
    [
      'setup.py names it',
      {
        'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
        'setup.py':
          'from setuptools import setup\nSCRIPTS = {"console_scripts": ["price=shop.pricing:total"]}\nsetup(name="shop", entry_points=SCRIPTS)\n',
      },
    ],
  ])('does not judge it when %s', (_name, files) => {
    expect(unused(files)).toEqual([]);
  });

  it('still judges it when setup.py builds its entry points at run time', () => {
    expect(
      unused({
        'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
        'setup.py':
          'from setuptools import setup\nsetup(name="shop", entry_points=load_entry_points())\n',
      }),
    ).toEqual(['total.cents', 'total.rate']);
  });

  it('does not count a Django tests.py or a top-level testing folder as callers', () => {
    expect(
      unused({
        'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
        'shop/tests.py': 'from shop.pricing import total\ntotal(1, rate=2)\n',
        'testing/helpers.py': 'from shop.pricing import total\ntotal(1, cents=True)\n',
      }),
    ).toEqual(['total.cents', 'total.rate']);
  });

  it('counts a testing package inside the package as shipped code', () => {
    expect(
      unused({
        'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
        'shop/testing/__init__.py': '',
        'shop/testing/helpers.py': 'from shop.pricing import total\ntotal(1, rate=2, cents=True)\n',
      }),
    ).toEqual([]);
  });

  it('reports a pyproject.toml or setup.cfg it cannot read and still checks the code', () => {
    const report = reportOf({
      'shop/__init__.py': '',
      'shop/pricing.py': TOTAL,
      'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
      'pyproject.toml': '[project\nname = "shop"\n',
      'setup.cfg': '[options.entry_points\nconsole_scripts = x\n',
    });

    expect(report.filter(({ rule }) => rule !== 'unused-option')).toEqual([
      {
        rule: 'project-file-invalid',
        path: 'pyproject.toml',
        subject: 'pyproject.toml',
        line: 1,
        data: { problem: 'Invalid TOML document: illegal character in key (line 1, column 9)' },
      },
      {
        rule: 'project-file-invalid',
        path: 'setup.cfg',
        subject: 'setup.cfg',
        line: 1,
        data: {
          problem: expect.stringMatching(
            /^MissingSectionHeaderError: File contains no section headers/,
          ),
        },
      },
    ]);
    expect(report.filter(({ rule }) => rule === 'unused-option')).toHaveLength(2);
  });

  it('does not judge test helpers or decorated functions', () => {
    expect(
      unused({
        'shop/pricing.py': `@register\n${TOTAL}`,
        'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
        'tests/helpers.py': 'def make(size: int = 1) -> int:\n    return size\n',
        'tests/test_a.py': 'from tests.helpers import make\nmake()\n',
      }),
    ).toEqual([]);
  });
});

describe.skipIf(!enabled)('an expression too deep for the recursion limit', () => {
  it('notes the skipped checks of that file and checks the others', () => {
    const sum = `total = ${Array.from({ length: 900 }, () => '1').join(' + ')}\n`;

    expect(
      reportOf({
        'shop/sums.py': sum,
        'shop/users.py': 'def load_user():\n    """Load the user."""\n',
      }),
    ).toEqual([
      { rule: 'rules-skipped', path: 'shop/sums.py', subject: 'file', line: 1 },
      { rule: 'restating-docstring', path: 'shop/users.py', subject: 'load_user', line: 2 },
    ]);
  });

  it('notes a file that is too deep to parse', () => {
    const sum = `total = ${Array.from({ length: 30000 }, () => '1').join(' + ')}\n`;

    expect(reportOf({ 'shop/sums.py': sum })).toEqual([
      { rule: 'rules-skipped', path: 'shop/sums.py', subject: 'all', line: 1 },
    ]);
  });
});

describe.skipIf(!enabled)('production-only rules in a test file', () => {
  it.each([
    [
      'forwarding-wrapper',
      'from shop.pricing import compute\n\n\ndef total(amount: int, rate: int = 2, *, cents: bool = False) -> int:\n    return compute(amount, rate, cents=cents)\n',
    ],
    [
      'exhaustive-enum-predicate',
      'from shop.status import Status\n\n\ndef is_open(s: Status) -> bool:\n    return s == Status.NEW or s == Status.PAID\n',
    ],
    [
      'singular-and-plural-field',
      'def make(tag: str = "", tags: list[str] = ()) -> None:\n    pass\n',
    ],
  ])('does not report %s', (rule, code) => {
    const files = { 'shop/__init__.py': '', 'shop/pricing.py': PRICING, 'shop/status.py': STATUS };

    expect(only(rule, { ...files, 'shop/helpers.py': code })).toHaveLength(1);
    expect(only(rule, { ...files, 'tests/test_helpers.py': code })).toEqual([]);
  });
});
