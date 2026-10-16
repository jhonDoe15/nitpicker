import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from './test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf, single } = createScripts();
afterEach(cleanup);

const TEST_FILE = 'tests/test_orders.py';
const unasserted = (...subjects) =>
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
    [
      'an assert in a helper that is not called',
      'def test_total():\n    def check():\n        assert True\n    total([1])\n',
      [],
    ],
    ['an unknown call', 'def test_total():\n    verify_total([1])\n', [['test_total', 1]]],
  ])('flags %s', (_name, code, expected) => {
    expect(single(code, TEST_FILE)).toEqual(unasserted(...expected));
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
    ['an assert_ helper', 'def test_total():\n    assert_valid(total([1]))\n'],
    [
      'a chained assertion library',
      'def test_total():\n    assert_that(total([1])).is_equal_to(1)\n',
    ],
    ['a playwright expect', 'def test_page(page):\n    expect(page).to_have_title("x")\n'],
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
  const twoTests = (call) => `def test_a():\n    ${call}(1)\n\n\ndef test_b():\n    ${call}(2)\n`;

  it.each(['check_total', 'verify_total', 'ensure_total', 'validate_total', 'expect_total'])(
    'learns %s as a helper once two tests end with it',
    (name) => {
      expect(single(twoTests(name), TEST_FILE)).toEqual([]);
    },
  );

  it('does not learn a name used by one test, or a name that is not about checking', () => {
    expect(single('def test_a():\n    check_total(1)\n', TEST_FILE)).toEqual(
      unasserted(['test_a', 1]),
    );
    expect(single(twoTests('run_total'), TEST_FILE)).toEqual(
      unasserted(['test_a', 1], ['test_b', 5]),
    );
  });

  it('learns a helper from the tests of other files', () => {
    const findings = findingsOf({
      'tests/test_a.py': 'def test_a():\n    check_it(1)\n',
      'tests/test_b.py': 'def test_b():\n    check_it(2)\n\n\ndef test_c():\n    other(3)\n',
    });

    expect(findings).toEqual(['test-without-assertion tests/test_b.py:5 test_c']);
  });

  it('counts a function that asserts, defined in the test helpers of the project', () => {
    const findings = findingsOf({
      'tests/helpers.py': 'def same(left, right):\n    assert left == right\n',
      'tests/test_a.py': 'from helpers import same\n\n\ndef test_a():\n    same(1, 1)\n',
      'tests/test_b.py': 'def test_b():\n    unknown(1)\n',
    });

    expect(findings).toEqual(['test-without-assertion tests/test_b.py:1 test_b']);
  });

  it('counts a helper that reaches an assertion through another helper', () => {
    const findings = findingsOf({
      'tests/helpers.py':
        'def same(left, right):\n    assert left == right\n\n\ndef same_twice(left, right):\n    same(left, right)\n    same(right, left)\n',
      'tests/test_a.py': 'def test_a():\n    same_twice(1, 1)\n',
    });

    expect(findings).toEqual([]);
  });

  it('does not count a source function that happens to contain an assert', () => {
    const findings = findingsOf({
      'src/pricing.py': 'def total(items):\n    assert items\n    return len(items)\n',
      'tests/test_a.py': 'def test_a():\n    total([1])\n',
    });

    expect(findings).toEqual(['test-without-assertion tests/test_a.py:1 test_a']);
  });

  it('counts a function of a testing module of the source tree', () => {
    const findings = findingsOf({
      'src/shop/testing.py': 'def same(left, right):\n    assert left == right\n',
      'tests/test_a.py': 'def test_a():\n    same(1, 1)\n',
    });

    expect(findings).toEqual([]);
  });
});
