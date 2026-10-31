import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['test-without-assertion'] });
afterEach(cleanup);

const inTest = (body, prelude = '') => ({
  file: 'tests/test_prices.py',
  code: `${prelude}def test_total():\n    ${body}\n`,
});
const UNITTEST = 'import unittest\n\n\nclass Prices(unittest.TestCase):\n    ';

describe.skipIf(!enabled)('float-equality-in-test', () => {
  it('flags an exact comparison with a non-integral float literal', () => {
    const [actual, expected] = outcomes([
      [
        'the literal on the right',
        inTest('assert total() == 0.3'),
        ['float-equality-in-test:2 0.3'],
      ],
      [
        'the literal on the left',
        inTest('assert 0.3 == total()'),
        ['float-equality-in-test:2 0.3'],
      ],
      ['not equal', inTest('assert total() != 0.3'), ['float-equality-in-test:2 0.3']],
      ['a negative literal', inTest('assert total() == -2.5'), ['float-equality-in-test:2 -2.5']],
      ['an exponent', inTest('assert rate() == 1e-3'), ['float-equality-in-test:2 1e-3']],
      [
        'a chained comparison',
        inTest('assert a() == b() == 0.5'),
        ['float-equality-in-test:2 0.5'],
      ],
      [
        'inside a boolean',
        inTest('assert ok() and rate() == 0.5'),
        ['float-equality-in-test:2 0.5'],
      ],
      ['a list literal', inTest('assert totals() == [1, 0.5]'), ['float-equality-in-test:2 0.5']],
      ['a dict value', inTest('assert rates() == {"eur": 0.9}'), ['float-equality-in-test:2 0.9']],
      [
        'a nested tuple',
        inTest('assert pairs() == ((1, 0.25),)'),
        ['float-equality-in-test:2 0.25'],
      ],
      [
        'assertEqual',
        {
          file: 'tests/test_prices.py',
          code: `${UNITTEST}def test_total(self):\n        self.assertEqual(total(), 0.3)\n`,
        },
        ['float-equality-in-test:6 0.3'],
      ],
      [
        'assertNotEqual with the literal first',
        {
          file: 'tests/test_prices.py',
          code: `${UNITTEST}def test_total(self):\n        self.assertNotEqual(0.3, total())\n`,
        },
        ['float-equality-in-test:6 0.3'],
      ],
      [
        'a literal between two operands of a chain',
        inTest('assert a() == 0.5 == b()'),
        ['float-equality-in-test:2 0.5'],
      ],
      [
        'assertEqual with keyword arguments',
        {
          file: 'tests/test_prices.py',
          code: `${UNITTEST}def test_total(self):\n        self.assertEqual(first=total(), second=0.3)\n`,
        },
        ['float-equality-in-test:6 0.3'],
      ],
      [
        'assertTrue around a comparison',
        {
          file: 'tests/test_prices.py',
          code: `${UNITTEST}def test_total(self):\n        self.assertTrue(total() == 0.3)\n`,
        },
        ['float-equality-in-test:6 0.3'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('allows tolerant comparisons, integral literals and code outside tests', () => {
    const [actual, expected] = outcomes([
      ['pytest.approx', inTest('assert total() == pytest.approx(0.3)', 'import pytest\n\n\n'), []],
      [
        'approx imported by name',
        inTest('assert total() == approx([0.1, 0.2])', 'from pytest import approx\n\n\n'),
        [],
      ],
      ['approx on the actual value', inTest('assert pytest.approx(total()) == 0.3'), []],
      ['math.isclose', inTest('assert math.isclose(total(), 0.3)', 'import math\n\n\n'), []],
      ['an integral float', inTest('assert total() == 1.0'), []],
      ['an integral exponent', inTest('assert total() == 2e3'), []],
      ['an integer', inTest('assert total() == 3'), []],
      ['an infinity literal', inTest('assert total() == 1e999'), []],
      ['an ordering comparison', inTest('assert abs(total() - 0.3) < 1e-9'), []],
      ['a float argument of the call', inTest('assert total(0.5) == expected()'), []],
      [
        'assertAlmostEqual',
        {
          file: 'tests/test_prices.py',
          code: `${UNITTEST}def test_total(self):\n        self.assertAlmostEqual(total(), 0.3)\n`,
        },
        [],
      ],
      [
        'production code',
        { file: 'src/prices.py', code: 'def is_tenth(x):\n    return x == 0.1\n' },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
