import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from './test-support/python-script-helpers.mjs';

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
      [['is_open Status', { union: 'Status', every: false }]],
    ],
    [
      'an and-chain of is not, assigned',
      'def f(s: Status) -> None:\n    closed = s is not Status.NEW and s is not Status.PAID\n',
      [['f Status', { union: 'Status', every: false }]],
    ],
    [
      'a membership test of every member',
      'def known(s: Status) -> bool:\n    return s in (Status.NEW, Status.PAID, Status.SHIPPED)\n',
      [['known Status', { union: 'Status', every: true }]],
    ],
    [
      'a predicate inside not and a conditional',
      'def f(s: Status, x: bool) -> bool:\n    return not (s == Status.NEW or s == Status.PAID) if x else x\n',
      [['f Status', { union: 'Status', every: false }]],
    ],
    [
      'a lambda body',
      'OPEN = lambda s: s in {Status.NEW, Status.PAID}\n',
      [['Status', { union: 'Status', every: false }]],
    ],
    [
      'a Literal alias parameter',
      'from typing import Literal\nKind = Literal["a", "b", "c"]\ndef f(k: Kind | None) -> bool:\n    return k == "a" or k == "b"\n',
      [['f Kind', { union: 'Kind', every: false }]],
    ],
    [
      'an if condition',
      'def f(s: Status) -> int:\n    if s == Status.NEW or s == Status.PAID:\n        return 1\n    return 0\n',
      [],
    ],
    ['a single membership value', 'def f(s: Status) -> bool:\n    return s in (Status.NEW,)\n', []],
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
  ])('does not judge it when %s', (_name, files) => {
    expect(unused(files)).toEqual([]);
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
