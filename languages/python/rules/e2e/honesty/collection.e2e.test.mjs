import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

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

describe.skipIf(!enabled)('uncollected-tests in other configurations', () => {
  const passing =
    'def test_a():\n    assert total() == 3\n\n\ndef test_b():\n    assert total() == 3\n';
  const lines = (...rows) => rows.join('\n') + '\n';

  it('reads the native pytest table, norecursedirs, ignore, deselect and -k', () => {
    const files = {
      'pyproject.toml': lines(
        '[tool.pytest]',
        'python_files = ["test_*.py"]',
        'norecursedirs = ["slow"]',
        'addopts = ["--ignore=tests/test_ignored.py", "--deselect=tests/test_a.py::test_b", "-k", "not flaky"]',
      ),
      'tests/test_a.py': passing,
      'tests/test_ignored.py': passing,
      'tests/slow/test_slow.py': passing,
      'tests/test_flaky.py':
        'import pytest\n\n\n@pytest.mark.flaky\ndef test_c():\n    assert total() == 3\n',
      'tests/orders_test.py': passing,
    };

    expect(findingsOf(files, pytest)).toEqual([
      'uncollected-tests tests/orders_test.py:1 orders_test.py',
      'uncollected-tests tests/slow/test_slow.py:1 tests/slow/test_slow.py (norecursedirs)',
      'uncollected-tests tests/test_a.py:5 test_b (--deselect)',
      'uncollected-tests tests/test_flaky.py:5 test_c (-k)',
      'uncollected-tests tests/test_ignored.py:1 tests/test_ignored.py (--ignore)',
    ]);
  });

  it('reports a test the -m marker expression hides and keeps the ones it selects', () => {
    const marked = (decorator) =>
      `import pytest\n\n\n${decorator}\ndef test_c():\n    assert total() == 3\n`;
    const files = {
      'pyproject.toml': lines('[tool.pytest.ini_options]', 'addopts = "-m \'not slow\'"'),
      'tests/test_slow.py': marked('@pytest.mark.slow'),
      'tests/test_fast.py': marked('@pytest.mark.fast'),
      'tests/test_slowly.py': marked('@pytest.mark.slowly'),
      'tests/test_module.py': `import pytest\n\npytestmark = [pytest.mark.slow]\n\n\n${passing}`,
    };

    expect(findingsOf(files, pytest)).toEqual([
      'uncollected-tests tests/test_module.py:6 test_a (-m)',
      'uncollected-tests tests/test_module.py:10 test_b (-m)',
      'uncollected-tests tests/test_slow.py:5 test_c (-m)',
    ]);
  });

  it('reads collect_ignore from a conftest and testpaths', () => {
    const files = {
      'pytest.ini': '[pytest]\ntestpaths = tests\n',
      'tests/conftest.py': 'collect_ignore = ["legacy"]\n',
      'tests/legacy/test_old.py': passing,
      'tests/test_new.py': passing,
      'other/test_elsewhere.py': passing,
    };

    expect(findingsOf(files, pytest)).toEqual([
      'uncollected-tests other/test_elsewhere.py:1 other/test_elsewhere.py (testpaths)',
      'uncollected-tests tests/legacy/test_old.py:1 tests/legacy/test_old.py (collect_ignore)',
    ]);
  });

  it('flags classes pytest does not collect', () => {
    const files = {
      'tests/test_classes.py': lines(
        'import unittest',
        '',
        '',
        'class OrderTests:',
        '    def test_total(self):',
        '        assert total() == 3',
        '',
        '',
        'class TestWithInit:',
        '    def __init__(self):',
        '        self.x = 1',
        '',
        '    def test_total(self):',
        '        assert total() == 3',
        '',
        '',
        'class TestFine:',
        '    def test_total(self):',
        '        assert total() == 3',
        '',
        '',
        'class OrderCase(unittest.TestCase):',
        '    def test_total(self):',
        '        self.assertEqual(total(), 3)',
        '',
        '',
        'class SharedChecks:',
        '    def test_shared(self):',
        '        assert total() == 3',
        '',
        '',
        'class TestShared(SharedChecks):',
        '    pass',
      ),
    };

    expect(findingsOf(files, pytest)).toEqual([
      'uncollected-tests tests/test_classes.py:4 OrderTests (python_classes)',
      'uncollected-tests tests/test_classes.py:9 TestWithInit (__init__)',
    ]);
  });

  it('checks unittest files against test*.py', () => {
    const files = {
      'tests/orders_test.py':
        'import unittest\n\n\nclass A(unittest.TestCase):\n    def test_a(self):\n        self.assertEqual(total(), 3)\n',
      'tests/test_orders.py':
        'import unittest\n\n\nclass B(unittest.TestCase):\n    def test_a(self):\n        self.assertEqual(total(), 3)\n',
    };

    expect(findingsOf(files, { testRunner: 'unittest' })).toEqual([
      'uncollected-tests tests/orders_test.py:1 orders_test.py (unittest)',
    ]);
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

  it('accepts a public testing module of a library', () => {
    const files = {
      'src/mylib/__init__.py': 'from mylib import testing\n',
      'src/mylib/testing.py': 'X = 1\n',
      'src/other/testing.py': 'X = 1\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'test-helper-in-source src/other/testing.py:1 testing.py',
    ]);
  });
});
