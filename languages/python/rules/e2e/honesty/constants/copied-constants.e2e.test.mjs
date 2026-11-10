import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts({
  hidden: ['test-without-assertion', 'weak-assertion'],
});
afterEach(cleanup);

function outcomes(rows) {
  const entries = rows.map(([name, spec, found]) => [
    name,
    findingsOf(spec.files).map((line) => line.replace(/ \S+:(\d+) /, ':$1 ')),
    found,
  ]);
  return [
    Object.fromEntries(entries.map(([name, actual]) => [name, actual])),
    Object.fromEntries(entries.map(([name, , found]) => [name, found])),
  ];
}

const LIMITS = 'MAX_ITEMS = 50\nDEFAULT_REGION: Final = "eu-west-1"\nRATIO = 0.25\nOFFSET = -40\n';
const withTest = (code, extra = {}) => ({
  files: { 'shop/limits.py': LIMITS, 'tests/test_a.py': code, ...extra },
});
const FROM = 'from shop import limits\n\n\n';
const copy = (name, line) => [`copied-constant-in-test:${String(line)} ${name} from shop.limits`];

describe.skipIf(!enabled)('copied-constant-in-test', () => {
  it('flags a literal that copies the value of a constant the test can see', () => {
    const [actual, expected] = outcomes([
      ['a number', withTest(`${FROM}def test_a():\n    assert f(50)\n`), copy('MAX_ITEMS', 5)],
      [
        'a string',
        withTest(`${FROM}def test_a():\n    assert f("eu-west-1")\n`),
        copy('DEFAULT_REGION', 5),
      ],
      ['a float', withTest(`${FROM}def test_a():\n    assert f(0.25)\n`), copy('RATIO', 5)],
      [
        'a float equal to an integer',
        withTest(`${FROM}def test_a():\n    assert f(50.0)\n`),
        copy('MAX_ITEMS', 5),
      ],
      [
        'a negative number',
        withTest(`${FROM}def test_a():\n    assert f(-40)\n`),
        copy('OFFSET', 5),
      ],
      [
        'import of the module itself',
        withTest('import shop.limits\n\n\ndef test_a():\n    assert f(50)\n'),
        copy('MAX_ITEMS', 5),
      ],
      [
        'import with an alias',
        withTest('import shop.limits as lim\n\n\ndef test_a():\n    assert f(50)\n'),
        copy('MAX_ITEMS', 5),
      ],
      [
        'a name imported from the module',
        withTest('from shop.limits import MAX_ITEMS\n\n\ndef test_a():\n    assert f(5_0)\n'),
        copy('MAX_ITEMS', 5),
      ],
      [
        'a module imported from its package',
        withTest('from shop import limits\n\n\ndef test_a():\n    x = 50\n'),
        copy('MAX_ITEMS', 5),
      ],
      [
        'another statement of the same test',
        withTest(`${FROM}def test_a():\n    x = limits.MAX_ITEMS\n    assert f(50)\n`),
        copy('MAX_ITEMS', 6),
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('reads class constants, nested classes and modules loaded by name', () => {
    const shapes = {
      'shop/shapes.py':
        'import enum\n\n\nclass Api:\n    PAGE_SIZE = 25\n\n    class Paging:\n' +
        '        MAX_PAGES = 40\n\n\nclass _Hidden:\n    CODE = 4242\n\n\n' +
        'class Mode(enum.Enum):\n    STEADY = "steady-state"\n\n    class Limits:\n        BURST = 90\n',
    };
    const body = (head) =>
      `${head}\n\n\ndef test_a():\n    assert f(25, 40, 4242, "steady-state", 90)\n` +
      '    assert g(25) == shapes.Api.PAGE_SIZE\n';
    const at = (line) => [
      `copied-constant-in-test:${String(line)} Api.PAGE_SIZE from shop.shapes`,
      `copied-constant-in-test:${String(line)} Api.Paging.MAX_PAGES from shop.shapes`,
      `copied-constant-in-test:${String(line)} Mode.Limits.BURST from shop.shapes`,
    ];
    const [actual, expected] = outcomes([
      ['an import', withTest(body('from shop import shapes'), shapes), at(5)],
      [
        'import_module',
        withTest(
          body('from importlib import import_module\nshapes = import_module("shop.shapes")'),
          shapes,
        ),
        at(6),
      ],
      [
        'importorskip',
        withTest(body('import pytest\nshapes = pytest.importorskip("shop.shapes")'), shapes),
        at(6),
      ],
      [
        '__import__',
        withTest('limits = __import__("shop.limits")\n\n\ndef test_a():\n    assert f(50)\n'),
        copy('MAX_ITEMS', 5),
      ],
      [
        'a relative or computed name',
        withTest(
          'import importlib\nm = importlib.import_module(".limits", "shop")\n' +
            'n = importlib.import_module(name)\n\n\ndef test_a():\n    assert f(50)\n',
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('names every module that declares the value, once, sorted', () => {
    const [actual, expected] = outcomes([
      [
        'two modules',
        withTest('from shop import limits, caps\n\n\ndef test_a():\n    assert f(50)\n', {
          'shop/caps.py': 'CAP = 50\n',
        }),
        ['copied-constant-in-test:5 CAP from shop.caps or MAX_ITEMS from shop.limits'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('allows the name, a pin, trivial values and tests that cannot see the constant', () => {
    const [actual, expected] = outcomes([
      ['the name', withTest(`${FROM}def test_a():\n    assert f(limits.MAX_ITEMS + 1)\n`), []],
      ['a pin', withTest(`${FROM}def test_a():\n    assert limits.MAX_ITEMS == 50\n`), []],
      [
        'a pin with a name import',
        withTest(
          'from shop.limits import MAX_ITEMS\n\n\ndef test_a():\n    assert MAX_ITEMS == 50\n',
        ),
        [],
      ],
      [
        'a lambda that names it',
        withTest(`${FROM}def test_a():\n    g = lambda: limits.MAX_ITEMS or 50\n`),
        [],
      ],
      [
        'trivial values',
        withTest(
          'from shop import small\n\n\ndef test_a():\n    assert f(1, 0, -1, 2, "ab", "  ")\n',
          { 'shop/small.py': 'ONE = 1\nTWO = 2\nSHORT = "ab"\nBLANK = "   "\nMINUS = -1\n' },
        ),
        [],
      ],
      ['a string of the digits', withTest(`${FROM}def test_a():\n    assert f("50")\n`), []],
      [
        'a constant assigned twice',
        withTest(`${FROM}def test_a():\n    assert f(50)\n`, {
          'shop/limits.py': 'MAX_ITEMS = 50\nMAX_ITEMS = 60\n',
        }),
        [],
      ],
      ['no import of the module', withTest('def test_a():\n    assert f(50)\n'), []],
      [
        'an import of another module',
        withTest('from shop import other\n\n\ndef test_a():\n    assert f(50)\n', {
          'shop/other.py': 'X = 3\n',
        }),
        [],
      ],
      [
        'a constant declared in a test helper',
        withTest('from tests.support import PAGE\n\n\ndef test_a():\n    assert f(25)\n', {
          'tests/support.py': 'PAGE = 25\n',
        }),
        [],
      ],
      [
        'booleans and None',
        withTest(`${FROM}def test_a():\n    assert f(True, None)\n`, {
          'shop/limits.py': 'ENABLED = True\nNOTHING = None\nMAX_ITEMS = 50\n',
        }),
        [],
      ],
      [
        'a lower case name',
        withTest(`${FROM}def test_a():\n    assert f(7)\n`, {
          'shop/limits.py': 'limit = 7\nA = 7\n',
        }),
        [],
      ],
      [
        'an f-string and bytes',
        withTest(`${FROM}def test_a():\n    assert f(f"{x}", b"eu-west-1")\n`),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('does not read docstrings, annotations, imports or parameter ids as values', () => {
    const body =
      'import pytest\nfrom typing import Literal\nfrom shop import limits\n\n\n' +
      '@pytest.mark.parametrize("eu-west-1", [limits.MAX_ITEMS], ids=["eu-west-1"])\n' +
      'def test_a(x: Literal["eu-west-1"]) -> Literal["eu-west-1"]:\n' +
      '    "eu-west-1"\n    y: Literal["eu-west-1"] = limits.DEFAULT_REGION\n' +
      '    assert x\n\n\n' +
      'def test_b():\n    p = pytest.param(1, id="eu-west-1")\n    assert p\n';
    const [actual, expected] = outcomes([['skipped positions', withTest(body), []]]);

    expect(actual).toEqual(expected);
  });
});
