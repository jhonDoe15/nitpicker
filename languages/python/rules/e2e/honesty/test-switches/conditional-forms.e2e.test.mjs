import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: [
    'test-without-assertion',
    'switched-off-test',
    'tautological-assert',
    'swallowed-exception',
    'blind-suppress',
  ],
});
afterEach(cleanup);

const inTests = (code, file = 'tests/test_a.py') => ({ file, code });
const prelude = 'import pytest\nimport unittest\n\n\n';
const RULE = 'conditional-assertion-in-test';

describe.skipIf(!enabled)('conditional-assertion-in-test: branches that cannot pass', () => {
  it('leaves a branch alone when it can only fail or skip the test', () => {
    const [actual, expected] = outcomes([
      [
        'pytest.fail in an if branch',
        inTests(
          `${prelude}def test_a():\n    r = f()\n    if r is None:\n        pytest.fail("none")\n    assert r\n`,
        ),
        [],
      ],
      [
        'pytest.fail in an except handler',
        inTests(
          `${prelude}def test_a():\n    try:\n        f()\n    except OSError:\n        pytest.fail("no")\n`,
        ),
        [],
      ],
      [
        'self.fail in an except handler',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        try:\n            f()\n        except OSError:\n            self.fail("no")\n`,
        ),
        [],
      ],
      [
        'pytest.skip in the else of an asserting branch',
        inTests(
          `${prelude}def test_a():\n    if f():\n        assert g()\n    else:\n        pytest.skip("no")\n`,
        ),
        [],
      ],
      [
        'self.skipTest in the else of an asserting branch',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        if f():\n            self.assertTrue(g())\n        else:\n            self.skipTest("no")\n`,
        ),
        [],
      ],
      [
        'a wildcard case that fails',
        inTests(
          `${prelude}def test_a(x):\n    match x:\n        case 1:\n            assert g()\n        case _:\n            pytest.fail("x")\n`,
        ),
        [],
      ],
      [
        'a handler that fails and an else that asserts',
        inTests(
          `${prelude}def test_a():\n    try:\n        r = f()\n    except OSError:\n        pytest.fail("no")\n    else:\n        assert r\n`,
        ),
        [],
      ],
      [
        'raise AssertionError in a branch',
        inTests(
          'def test_a():\n    if f():\n        raise AssertionError("bad")\n    assert g()\n',
        ),
        [],
      ],
      [
        'assert False in the last branch',
        inTests(
          'def test_a():\n    if f():\n        assert g()\n    else:\n        assert False, "unknown"\n',
        ),
        [],
      ],
      [
        'an elif chain whose other branches raise or fail',
        inTests(
          `${prelude}def test_a(x):\n    if x == 1:\n        assert g()\n    elif x == 2:\n        raise ValueError(x)\n    else:\n        pytest.fail("x")\n`,
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('still reports an assertion when another branch can pass', () => {
    const [actual, expected] = outcomes([
      [
        'asserting branches on both sides',
        inTests('def test_a():\n    if f():\n        assert g()\n    else:\n        assert h()\n'),
        [`${RULE}:3 test_a: if`],
      ],
      [
        'two passing branches next to a failing one',
        inTests(
          `${prelude}def test_a(x):\n    if x == 1:\n        assert g()\n    elif x == 2:\n        assert h()\n    else:\n        pytest.fail("x")\n`,
        ),
        [`${RULE}:7 test_a: if`],
      ],
      [
        'no else',
        inTests(`${prelude}def test_a():\n    if f():\n        assert g()\n`),
        [`${RULE}:7 test_a: if`],
      ],
      [
        'a branch that returns',
        inTests('def test_a():\n    if f():\n        assert g()\n    else:\n        return\n'),
        [`${RULE}:3 test_a: if`],
      ],
      [
        'a match without a wildcard',
        inTests('def test_a(x):\n    match x:\n        case 1:\n            assert g()\n'),
        [`${RULE}:4 test_a: match`],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('conditional-assertion-in-test: branches inside an assertion', () => {
  it('reports a ternary or an implication in an assertion', () => {
    const [actual, expected] = outcomes([
      [
        'a ternary',
        inTests('def test_a():\n    assert f() if g() else True\n'),
        [`${RULE}:2 test_a: if`],
      ],
      [
        'a ternary with a value',
        inTests('def test_a():\n    assert f() if g() else h()\n'),
        [`${RULE}:2 test_a: if`],
      ],
      [
        'an implication',
        inTests('def test_a():\n    assert (not g()) or f()\n'),
        [`${RULE}:2 test_a: boolean`],
      ],
      [
        'an implication inside an and',
        inTests('def test_a():\n    assert h() and (not g() or f())\n'),
        [`${RULE}:2 test_a: boolean`],
      ],
      [
        'a ternary in the argument of an assertion call',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        self.assertTrue(f() if g() else True)\n`,
        ),
        [`${RULE}:7 A.test_a: if (unittest)`],
      ],
      [
        'a ternary in the argument of a same-file helper',
        inTests(
          'def check_it(x):\n    assert x\n\n\ndef test_a():\n    check_it(f() if g() else True)\n',
        ),
        [`${RULE}:6 test_a: if`],
      ],
      ['an or of two comparisons', inTests('def test_a():\n    assert f() == 1 or f() == 2\n'), []],
      [
        'an optional check',
        inTests('def test_a():\n    x = f()\n    assert x is None or x > 0\n'),
        [],
      ],
      [
        'a negated and written as or',
        inTests('def test_a():\n    assert not f() or not g()\n'),
        [],
      ],
      [
        'a ternary that selects a value',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        self.assertEqual(f() if g() else h(), 3)\n`,
        ),
        [],
      ],
      [
        'a ternary that selects a value inside a comparison',
        inTests('def test_a():\n    assert (f() if g() else h()) == 3\n'),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('conditional-assertion-in-test: blocks that swallow the failure', () => {
  const suppress = (caught, extra = '') =>
    `import contextlib\n${extra}\n\ndef test_a():\n    with contextlib.suppress(${caught}):\n        assert f()\n`;

  it('reports an assertion that a suppressing block or handler swallows', () => {
    const [actual, expected] = outcomes([
      [
        'suppress AssertionError',
        inTests(suppress('AssertionError')),
        [`${RULE}:6 test_a: suppress`],
      ],
      ['suppress Exception', inTests(suppress('Exception')), [`${RULE}:6 test_a: suppress`]],
      [
        'suppress BaseException',
        inTests(suppress('BaseException')),
        [`${RULE}:6 test_a: suppress`],
      ],
      [
        'suppress a tuple',
        inTests(suppress('ValueError, AssertionError')),
        [`${RULE}:6 test_a: suppress`],
      ],
      [
        'suppress imported by name',
        inTests(
          'from contextlib import suppress\n\n\ndef test_a():\n    with suppress(AssertionError):\n        assert f()\n',
        ),
        [`${RULE}:6 test_a: suppress`],
      ],
      [
        'a handler that swallows AssertionError',
        inTests(
          'def test_a():\n    try:\n        assert f()\n    except AssertionError:\n        pass\n',
        ),
        [`${RULE}:3 test_a: suppress`],
      ],
      [
        'a bare handler that logs',
        inTests('def test_a():\n    try:\n        assert f()\n    except:\n        print("x")\n'),
        [`${RULE}:3 test_a: suppress`],
      ],
      ['suppress another error', inTests(suppress('ValueError')), []],
      [
        'a handler that raises again',
        inTests(
          'def test_a():\n    try:\n        assert f()\n    except Exception:\n        raise\n',
        ),
        [],
      ],
      [
        'a handler that fails the test',
        inTests(
          `${prelude}def test_a():\n    try:\n        assert f()\n    except Exception:\n        pytest.fail("x")\n`,
        ),
        [],
      ],
      [
        'a handler for another error',
        inTests(
          'def test_a():\n    try:\n        assert f()\n    except ValueError:\n        pass\n',
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)(
  'conditional-assertion-in-test: nested functions and same-file helpers',
  () => {
    it('follows a nested function or helper to the place the test calls it', () => {
      const nested = 'def test_a():\n    def check(x):\n        assert x\n\n';
      const [actual, expected] = outcomes([
        ['a nested function called by the test', inTests(`${nested}    check(1)\n`), []],
        [
          'a nested function called in a branch',
          inTests(`${nested}    if f():\n        check(1)\n`),
          [`${RULE}:3 test_a: if`],
        ],
        [
          'a nested function called in a loop',
          inTests(`${nested}    for n in f():\n        check(n)\n`),
          [`${RULE}:3 test_a: for`],
        ],
        ['a nested function handed to map', inTests(`${nested}    list(map(check, f()))\n`), []],
        [
          'a nested function handed to map in a branch',
          inTests(`${nested}    if g():\n        list(map(check, f()))\n`),
          [`${RULE}:3 test_a: if`],
        ],
        [
          'a nested function that loops',
          inTests(
            'def test_a():\n    def check(cases):\n        for case in cases:\n            assert f(case)\n\n    check([1])\n',
          ),
          [`${RULE}:4 test_a: for`],
        ],
        [
          'a lambda handed to map',
          inTests(
            `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        list(map(lambda n: self.assertTrue(n), f()))\n`,
          ),
          [],
        ],
        [
          'a lambda held in a variable and called in a branch',
          inTests(
            `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        check = lambda n: self.assertTrue(n)\n        if f():\n            check(1)\n`,
          ),
          [`${RULE}:7 A.test_a: if (unittest)`],
        ],
        ['a nested function that is never called', inTests(`${nested}    assert f()\n`), []],
        [
          'a same-file helper called in a branch',
          inTests(
            'def check_it(x):\n    assert x\n\n\ndef test_a():\n    if g():\n        check_it(1)\n',
          ),
          [`${RULE}:7 test_a: if`],
        ],
        [
          'a same-file helper called in a loop',
          inTests(
            'def check_it(x):\n    assert x\n\n\ndef test_a():\n    for n in f():\n        check_it(n)\n',
          ),
          [`${RULE}:7 test_a: for`],
        ],
        [
          'a same-file helper handed to map',
          inTests(
            'def check_it(x):\n    assert x\n\n\ndef test_a():\n    list(map(check_it, f()))\n',
          ),
          [],
        ],
        [
          'a same-file helper handed to map in a branch',
          inTests(
            'def check_it(x):\n    assert x\n\n\ndef test_a():\n    if g():\n        list(map(check_it, f()))\n',
          ),
          [`${RULE}:7 test_a: if`],
        ],
        [
          'a same-file helper called by the test',
          inTests('def check_it(x):\n    assert x\n\n\ndef test_a():\n    check_it(f())\n'),
          [],
        ],
        [
          'a method of the class that asserts, called in a branch',
          inTests(
            'class TestA:\n    def _check(self, x):\n        assert x\n\n    def test_a(self):\n        if f():\n            self._check(1)\n',
          ),
          [`${RULE}:7 TestA.test_a: if`],
        ],
        [
          'a same-file function that does not assert',
          inTests(
            'def build(x):\n    return x\n\n\ndef test_a():\n    if g():\n        build(1)\n    assert f()\n',
          ),
          [],
        ],
      ]);

      expect(actual).toEqual(expected);
    });
  },
);

describe.skipIf(!enabled)('conditional-assertion-in-test: which tests are found', () => {
  it('finds tests in a module level branch and in nested classes', () => {
    const [actual, expected] = outcomes([
      [
        'a test in a module level if',
        inTests(
          'import sys\n\nif sys.platform == "linux":\n\n    def test_a():\n        for n in f():\n            assert n\n',
        ),
        [`${RULE}:7 test_a: for`],
      ],
      [
        'a test in a module level try',
        inTests(
          'try:\n    import numpy\nexcept ImportError:\n    numpy = None\nelse:\n\n    def test_a():\n        for n in f():\n            assert n\n',
        ),
        [`${RULE}:9 test_a: for`],
      ],
      [
        'a test in a nested class',
        inTests(
          'class TestOuter:\n    class TestInner:\n        def test_a(self):\n            if f():\n                assert g()\n',
        ),
        [`${RULE}:5 TestOuter.TestInner.test_a: if`],
      ],
      [
        'a test class of unittest gets the unittest wording',
        inTests(
          `${prelude}class TestA(unittest.TestCase):\n    def test_a(self):\n        for n in f():\n            self.assertTrue(n)\n`,
        ),
        [`${RULE}:8 TestA.test_a: for (unittest)`],
      ],
      [
        'a class that pytest does not collect',
        inTests(
          'class Helper:\n    def test_a(self):\n        for n in f():\n            assert n\n',
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
