import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const scripts = createScripts();
const { cleanup } = scripts;
afterEach(cleanup);

function unasserted(lines) {
  return lines.filter((line) => line.startsWith('test-without-assertion '));
}

function findingsOf(files) {
  return unasserted(scripts.findingsOf(files));
}

function single(code, file) {
  return unasserted(scripts.single(code, file));
}

const TEST_FILE = 'tests/test_orders.py';
const expectedFindings = (...subjects) =>
  subjects.map(([name, line]) => `test-without-assertion ${TEST_FILE}:${String(line)} ${name}`);

describe.skipIf(!enabled)('test-without-assertion', () => {
  it.each([
    ['a call with no assertion', 'def test_total():\n    total([1])\n', [['test_total', 1]]],
    ['a body of pass', 'def test_total():\n    pass\n', [['test_total', 1]]],
    ['an async test', 'async def test_total():\n    await total([1])\n', [['test_total', 1]]],
    ['a bare test name', 'def test():\n    total([1])\n', [['test', 1]]],
    [
      'a method of a Test class',
      'class TestOrders:\n    def test_total(self):\n        total([1])\n',
      [['TestOrders.test_total', 2]],
    ],
    [
      'a method of a TestCase',
      'class Orders(unittest.TestCase):\n    def testTotal(self):\n        total([1])\n',
      [['Orders.testTotal', 2]],
    ],
    ['an unknown call', 'def test_total():\n    verify_total([1])\n', [['test_total', 1]]],
    [
      'an assert_ call nobody proved',
      'def test_total():\n    assert_valid(total([1]))\n',
      [['test_total', 1]],
    ],
    ['a skip that is not pytest', 'def test_total():\n    skip("later")\n', [['test_total', 1]]],
    [
      'a fail on another receiver',
      'def test_total():\n    report.fail("bad")\n',
      [['test_total', 1]],
    ],
    [
      'a skip on another receiver',
      'def test_total():\n    runner.skip("bad")\n',
      [['test_total', 1]],
    ],
    [
      'an expect that is not imported',
      'def test_page(page):\n    expect(page).to_have_title("x")\n',
      [['test_page', 1]],
    ],
    [
      'a check that is not pytest-check',
      'from checks import check\n\n\ndef test_total():\n    check.equal(total([1]), 1)\n',
      [['test_total', 4]],
    ],
  ])('flags %s', (_name, code, expected) => {
    expect(single(code, TEST_FILE)).toEqual(expectedFindings(...expected));
  });

  it.each([
    ['an assert statement', 'def test_total():\n    assert total([1]) == 1\n'],
    [
      'pytest.raises',
      'def test_total():\n    with pytest.raises(ValueError):\n        total([])\n',
    ],
    ['pytest.warns', 'def test_total():\n    with pytest.warns(UserWarning):\n        total([])\n'],
    ['pytest.fail', 'def test_total():\n    if total([]):\n        pytest.fail("bad")\n'],
    ['raise AssertionError', 'def test_total():\n    raise AssertionError("bad")\n'],
    [
      'a unittest assertion',
      'class T(TestCase):\n    def test_total(self):\n        self.assertEqual(total([]), 0)\n',
    ],
    [
      'assertRaises as a context',
      'class T(TestCase):\n    def test_a(self):\n        with self.assertRaises(KeyError):\n            total([])\n',
    ],
    [
      'a mock assertion',
      'def test_total(mock):\n    total([1])\n    mock.assert_called_once_with(1)\n',
    ],
    [
      'an imported assertion library',
      'from assertpy import assert_that\n\n\ndef test_total():\n    assert_that(total([1])).is_equal_to(1)\n',
    ],
    [
      'a playwright expect',
      'from playwright.sync_api import expect\n\n\ndef test_page(page):\n    expect(page).to_have_title("x")\n',
    ],
    [
      'numpy testing',
      'import numpy as np\n\n\ndef test_total():\n    np.testing.assert_allclose(total([1]), 1)\n',
    ],
    ['self.fail', 'class T(TestCase):\n    def test_a(self):\n        self.fail("later")\n'],
    [
      'self.skipTest',
      'class T(TestCase):\n    def test_a(self):\n        self.skipTest("later")\n',
    ],
    [
      'a pytest function imported by name',
      'from pytest import fail\n\n\ndef test_a():\n    fail("bad")\n',
    ],
    ['a pytest alias', 'import pytest as pt\n\n\ndef test_a():\n    pt.xfail("bad")\n'],
    [
      'a pytest_check call',
      'from pytest_check import check\n\n\ndef test_a():\n    check.equal(total([1]), 1)\n',
    ],
    [
      'a pytest_check module call',
      'import pytest_check as check\n\n\ndef test_a():\n    check.is_true(total([1]))\n',
    ],
    [
      'a pytest_check block',
      'from pytest_check import check\n\n\ndef test_a():\n    with check:\n        total([1])\n',
    ],
    ['a pytest fixture named like a test', '@pytest.fixture\ndef test_data():\n    return [1]\n'],
    [
      'a called pytest fixture',
      '@pytest.fixture(scope="session")\ndef test_data():\n    return [1]\n',
    ],
    ['a bare fixture import', '@fixture\ndef test_data():\n    return [1]\n'],
    ['an assert inside a loop', 'def test_total():\n    for item in items:\n        assert item\n'],
    [
      'an assert in a nested function',
      'def test_total():\n    def check():\n        assert True\n    check()\n',
    ],
    ['pytest.skip', 'def test_total():\n    pytest.skip("later")\n'],
    ['a skip decorator', '@pytest.mark.skip(reason="later")\ndef test_total():\n    total([1])\n'],
    ['an xfail decorator', '@pytest.mark.xfail\ndef test_total():\n    total([1])\n'],
    ['a skipif decorator', '@unittest.skipIf(True, "x")\ndef test_total():\n    total([1])\n'],
    ['a function that is not a test', 'def helper():\n    total([1])\n'],
    ['a name that only starts with test', 'def testing_utils():\n    total([1])\n'],
    [
      'a nested class that is not a test class',
      'class Helpers:\n    def test_total(self):\n        total([1])\n',
    ],
  ])('allows %s', (_name, code) => {
    expect(single(code, TEST_FILE)).toEqual([]);
  });

  it.each(['tests/test_orders.py', 'src/orders_test.py', 'test_orders.py'])(
    'applies to the test file %s',
    (file) => {
      expect(single('def test_total():\n    total([1])\n', file)).toEqual([
        `test-without-assertion ${file}:1 test_total`,
      ]);
    },
  );

  it.each(['src/orders.py', 'tests/helpers.py', 'tests/conftest.py', 'src/latest.py'])(
    'does not apply to %s, which pytest does not collect by default',
    (file) => {
      expect(single('def test_total():\n    total([1])\n', file)).toEqual([]);
    },
  );
});

describe.skipIf(!enabled)('the assertion helpers of the project', () => {
  const HELPERS = 'def check_total(value):\n    assert value\n';
  const testing = (call, index) => `def test_${String(index)}():\n    ${call}(${String(index)})\n`;
  const filesCalling = (call, count, extra = {}) => ({
    'tests/helpers.py': HELPERS,
    ...Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `tests/test_${String(index)}.py`,
        `from helpers import check_total\n\n\n${testing(call, index)}`,
      ]),
    ),
    ...extra,
  });
  const failures = (count) =>
    Array.from(
      { length: count },
      (_, index) => `test-without-assertion tests/test_${String(index)}.py:4 test_${String(index)}`,
    );

  it('follows a helper that asserts once three test files end their bare tests with it', () => {
    expect(findingsOf(filesCalling('check_total', 3))).toEqual([]);
  });

  it('does not follow it with two test files', () => {
    expect(findingsOf(filesCalling('check_total', 2))).toEqual(failures(2));
  });

  it('never follows a name that is only measured, with no definition that asserts', () => {
    const files = filesCalling('check_total', 4, {
      'tests/helpers.py': 'def check_total(value):\n    return value\n',
    });

    expect(findingsOf(files)).toEqual(failures(4));
  });

  it('does not follow a measured name defined nowhere in the project', () => {
    const files = filesCalling('check_total', 4, { 'tests/helpers.py': 'VALUE = 1\n' });

    expect(findingsOf(files)).toEqual(failures(4));
  });

  it.each([
    [
      'pytest.raises',
      'def check_total(value):\n    with pytest.raises(ValueError):\n        value()\n',
    ],
    ['pytest.fail', 'def check_total(value):\n    pytest.fail("x")\n'],
    [
      'self.assertEqual',
      'class Base:\n    def check_total(self, value):\n        self.assertEqual(value, 1)\n',
    ],
    ['a raise', 'def check_total(value):\n    if not value:\n        raise ValueError(value)\n'],
  ])('accepts a definition that asserts with %s', (_name, helpers) => {
    expect(findingsOf(filesCalling('check_total', 3, { 'tests/helpers.py': helpers }))).toEqual([]);
  });

  it.each([
    [
      'a nested def',
      'def check_total(value):\n    def inner():\n        assert value\n    return inner\n',
    ],
    [
      'a lambda',
      'def check_total(value):\n    return lambda: (_ for _ in ()).throw(ValueError(value))\n',
    ],
    [
      'an assert in a nested class',
      'def check_total(value):\n    class A:\n        def run(self):\n            assert value\n',
    ],
  ])('rejects a definition that only asserts through %s', (_name, helpers) => {
    expect(findingsOf(filesCalling('check_total', 3, { 'tests/helpers.py': helpers }))).toEqual(
      failures(3),
    );
  });

  it('lets the tests that already assert vote for nothing', () => {
    const asserting = Object.fromEntries(
      [0, 1, 2].map((index) => [
        `tests/test_${String(index)}.py`,
        `from helpers import check_total\n\n\ndef test_${String(index)}():\n    assert True\n    check_total(1)\n`,
      ]),
    );

    expect(
      findingsOf({
        'tests/helpers.py': HELPERS,
        ...asserting,
        'tests/test_x.py': 'def test_x():\n    check_total(1)\n',
      }),
    ).toEqual(['test-without-assertion tests/test_x.py:1 test_x']);
  });

  it('counts test files, not tests', () => {
    const files = {
      'tests/helpers.py': HELPERS,
      'tests/test_a.py': `${testing('check_total', 1)}\n\n${testing('check_total', 2)}\n\n${testing('check_total', 3)}`,
      'tests/test_b.py': testing('check_total', 4),
    };

    expect(findingsOf(files)).toEqual([
      'test-without-assertion tests/test_a.py:1 test_1',
      'test-without-assertion tests/test_a.py:5 test_2',
      'test-without-assertion tests/test_a.py:9 test_3',
      'test-without-assertion tests/test_b.py:1 test_4',
    ]);
  });

  it('follows self.name and a call qualified by a project test-support module', () => {
    const files = {
      'tests/helpers.py': HELPERS,
      'tests/test_a.py': 'class TestA(Base):\n    def test_a(self):\n        self.check_total(1)\n',
      'tests/test_b.py': 'import helpers\n\n\ndef test_b():\n    helpers.check_total(1)\n',
      'tests/test_c.py':
        'from tests import helpers as support\n\n\ndef test_c():\n    support.check_total(1)\n',
      'tests/test_d.py': 'from helpers import check_total\n\n\ndef test_d():\n    check_total(1)\n',
    };

    expect(findingsOf(files)).toEqual([]);
  });

  it('does not count a call on an arbitrary receiver', () => {
    const files = {
      'tests/helpers.py': HELPERS,
      'tests/test_a.py': 'def test_a(thing):\n    thing.check_total(1)\n',
      'tests/test_b.py': 'import json\n\n\ndef test_b(thing):\n    json.check_total(1)\n',
      'tests/test_c.py': 'def test_c(thing):\n    thing.sub.check_total(1)\n',
      'tests/test_d.py': 'from helpers import check_total\n\n\ndef test_d():\n    check_total(1)\n',
    };

    expect(findingsOf(files)).toEqual([
      'test-without-assertion tests/test_a.py:1 test_a',
      'test-without-assertion tests/test_b.py:4 test_b',
      'test-without-assertion tests/test_c.py:1 test_c',
      'test-without-assertion tests/test_d.py:4 test_d',
    ]);
  });

  it('takes the definition from a conftest, a test file or a testing module', () => {
    const calls = (name) => ({
      'tests/test_a.py': `def test_a():\n    ${name}(1)\n`,
      'tests/test_b.py': `def test_b():\n    ${name}(1)\n`,
      'tests/test_c.py': `def test_c():\n    ${name}(1)\n`,
    });
    const definition = 'def check_total(value):\n    assert value\n';

    expect(findingsOf({ 'tests/conftest.py': definition, ...calls('check_total') })).toEqual([]);
    expect(findingsOf({ 'tests/test_helper.py': definition, ...calls('check_total') })).toEqual([]);
    expect(findingsOf({ 'src/shop/testing.py': definition, ...calls('check_total') })).toEqual([]);
  });

  it('does not take a definition from the source tree', () => {
    const files = filesCalling('check_total', 3, {
      'tests/helpers.py': 'VALUE = 1\n',
      'src/pricing.py': HELPERS,
    });

    expect(findingsOf(files)).toEqual(failures(3));
  });

  it('does not follow a name that is not the terminal call', () => {
    const files = Object.fromEntries(
      [0, 1, 2].map((index) => [
        `tests/test_${String(index)}.py`,
        `from helpers import check_total\n\n\ndef test_${String(index)}():\n    check_total(1)\n    run()\n`,
      ]),
    );

    expect(findingsOf({ 'tests/helpers.py': HELPERS, ...files })).toEqual(
      [0, 1, 2].map(
        (index) => `test-without-assertion tests/test_${String(index)}.py:4 test_${String(index)}`,
      ),
    );
  });

  it('does not follow a helper that only reaches an assertion through another helper', () => {
    const helpers = `${HELPERS}\n\ndef check_twice(value):\n    check_total(value)\n`;
    const files = filesCalling('check_twice', 3, { 'tests/helpers.py': helpers });

    expect(findingsOf(files)).toEqual(
      [0, 1, 2].map(
        (index) => `test-without-assertion tests/test_${String(index)}.py:4 test_${String(index)}`,
      ),
    );
  });
});
