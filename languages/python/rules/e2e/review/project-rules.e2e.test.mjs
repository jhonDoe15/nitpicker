import { afterEach, describe, expect, it } from 'vitest';
import { PRICING, STATUS, createProjectScripts } from '../../test-support/project-sources.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, dataOf, only, reportOf } = createProjectScripts();
afterEach(cleanup);

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

  it('keeps an import inside a function to that function', () => {
    expect(
      only('unused-option', {
        'shop/__init__.py': '',
        'shop/pricing.py': TOTAL,
        'shop/other.py': TOTAL,
        'shop/app.py':
          'from shop.pricing import total\ntotal(1)\n\n\ndef run():\n    from shop.other import total\n    return total(1, rate=2, cents=True)\n',
      }),
    ).toEqual([
      'unused-option shop/pricing.py:1 total.cents',
      'unused-option shop/pricing.py:1 total.rate',
    ]);
  });

  it('does not count tests as callers of a private package', () => {
    const files = {
      'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
      'tests/test_pricing.py': 'from shop.pricing import total\ntotal(1, rate=2, cents=True)\n',
    };
    expect(unused(files)).toEqual(['total.cents', 'total.rate']);
    expect(unused({ ...files, 'pyproject.toml': PUBLISHED })).toEqual([]);
    expect(unused({ ...files, 'setup.cfg': '[metadata]\nname = shop\n' })).toEqual([]);
    expect(
      unused({ ...files, 'setup.py': 'from setuptools import setup\nsetup(name="shop")\n' }),
    ).toEqual([]);
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
      'a poetry plugin names it',
      {
        'shop/app.py': 'from shop.pricing import total\ntotal(1)\n',
        'pyproject.toml':
          '[tool.poetry]\nname = "shop"\n[tool.poetry.plugins."shop.exporters"]\nprice = "shop.pricing:total"\n',
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
        'manage.py': '',
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

  it('fails on a setup.cfg it cannot read, naming it', () => {
    expect(() => reportOf({ 'shop/app.py': 'x = 1\n', 'setup.cfg/stray.txt': '' })).toThrow(
      'setup.cfg could not be read (EISDIR): fix or remove it',
    );
  });

  it('reads a setup.cfg the way the other readers do, so a stray tool section is no error', () => {
    expect(
      reportOf({
        'shop/__init__.py': '',
        'shop/app.py': 'x = 1\n',
        'setup.cfg': '[flake8]\nmax-line-length = 100\nmax-line-length = 120\n',
      }),
    ).toEqual([]);
  });

  it('fails on a pyproject.toml it cannot parse, as the dependency reader does', () => {
    expect(() =>
      reportOf({ 'shop/app.py': 'x = 1\n', 'pyproject.toml': '[project\nname = "shop"\n' }),
    ).toThrow(/Invalid TOML document/u);
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
        'tests/test_users.py': 'import time\ntime.sleep(1)\n',
      }),
    ).toEqual([
      { rule: 'rules-too-deep', path: 'shop/sums.py', subject: 'file', line: 1 },
      { rule: 'sleep-in-test', path: 'tests/test_users.py', subject: 'time.sleep', line: 2 },
    ]);
  });

  it('notes a file that is too deep to parse', () => {
    const sum = `total = ${Array.from({ length: 30000 }, () => '1').join(' + ')}\n`;

    expect(reportOf({ 'shop/sums.py': sum })).toEqual([
      { rule: 'rules-too-deep', path: 'shop/sums.py', subject: 'all', line: 1 },
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
