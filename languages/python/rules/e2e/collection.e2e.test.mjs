import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const test = 'def test_total():\n    assert total() == 3\n';
const pytest = { testRunner: 'pytest' };
const withIni = (pattern) => ({ 'pytest.ini': `[pytest]\npython_files = ${pattern}\n` });

describe.skipIf(!enabled)('uncollected-tests', () => {
  it('flags tests in a file pytest does not collect', () => {
    const [actual, expected] = outcomes(
      [
        [
          'a check file',
          { file: 'tests/orders_check.py', code: test },
          ['uncollected-tests:1 orders_check.py'],
        ],
        [
          'a tests.py file',
          { file: 'shop/tests.py', code: test },
          ['uncollected-tests:1 tests.py'],
        ],
        [
          'a test class',
          {
            file: 'tests/orders_check.py',
            code: 'class TestTotal:\n    def test_total(self):\n        assert total() == 3\n',
          },
          ['uncollected-tests:1 orders_check.py'],
        ],
        [
          'an async test',
          {
            file: 'tests/orders_check.py',
            code: 'async def test_total():\n    assert total() == 3\n',
          },
          ['uncollected-tests:1 orders_check.py'],
        ],
        ['test_ prefix', { file: 'tests/test_orders.py', code: test }, []],
        ['_test suffix', { file: 'tests/orders_test.py', code: test }, []],
        ['a conftest', { file: 'tests/conftest.py', code: test }, []],
        [
          'a helper file without tests',
          { file: 'tests/orders_check.py', code: 'def build():\n    return 1\n' },
          [],
        ],
        [
          'a test-like name outside a tests folder',
          { file: 'src/orders_check.py', code: test },
          [],
        ],
        [
          'a class that is no test class',
          {
            file: 'tests/orders_check.py',
            code: 'class Total:\n    def test_total(self):\n        assert total() == 3\n',
          },
          [],
        ],
      ],
      pytest,
    );
    expect(actual).toEqual(expected);
  });

  it('follows python_files of the project', () => {
    const file = 'tests/orders_check.py';
    expect(findingsOf({ [file]: test, ...withIni('check_*.py *_check.py') }, pytest)).toEqual([]);
    expect(findingsOf({ [file]: test, ...withIni('other_*.py') }, pytest)).toEqual([
      `uncollected-tests ${file}:1 orders_check.py`,
    ]);
  });

  it('applies to pytest only', () => {
    expect(findingsOf({ 'tests/orders_check.py': test }, { testRunner: 'unittest' })).toEqual([]);
  });
});

describe.skipIf(!enabled)('test-helper-in-source', () => {
  it('flags test support inside the production source roots', () => {
    const [actual, expected] = outcomes(
      [
        [
          'testing.py',
          { file: 'shop/testing.py', code: 'X = 1\n' },
          ['test-helper-in-source:1 testing.py'],
        ],
        [
          'testutils.py',
          { file: 'shop/testutils.py', code: 'X = 1\n' },
          ['test-helper-in-source:1 testutils.py'],
        ],
        [
          'a fixtures folder',
          { file: 'shop/fixtures/orders.py', code: 'X = 1\n' },
          ['test-helper-in-source:1 fixtures/'],
        ],
        [
          'a testutils folder',
          { file: 'shop/testutils/orders.py', code: 'X = 1\n' },
          ['test-helper-in-source:1 testutils/'],
        ],
        ['an ordinary module', { file: 'shop/orders.py', code: 'X = 1\n' }, []],
        ['a helper in the tests folder', { file: 'tests/support.py', code: 'X = 1\n' }, []],
        [
          'a fixtures folder under tests',
          { file: 'tests/fixtures/orders.py', code: 'X = 1\n' },
          [],
        ],
      ],
      { sourceRoots: ['.'] },
    );
    expect(actual).toEqual(expected);
  });

  it('looks only at the configured source roots', () => {
    expect(findingsOf({ 'src/shop/testing.py': 'X = 1\n' }, { sourceRoots: ['src'] })).toEqual([
      'test-helper-in-source src/shop/testing.py:1 testing.py',
    ]);
    expect(findingsOf({ 'tools/testing.py': 'X = 1\n' }, { sourceRoots: ['src'] })).toEqual([]);
  });
});
