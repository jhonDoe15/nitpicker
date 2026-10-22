import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: [
    'test-without-assertion',
    'switched-off-test',
    'tautological-assert',
    'swallowed-exception',
  ],
});
afterEach(cleanup);

const inTests = (code, file = 'tests/test_a.py') => ({ file, code });
const prelude = 'import pytest\nimport unittest\n\n\n';

describe.skipIf(!enabled)('conditional-assertion-in-test', () => {
  it('flags an assertion inside a loop, branch, handler or comprehension', () => {
    const [actual, expected] = outcomes([
      [
        'an assert in a for loop',
        inTests('def test_a():\n    for n in (1, 2):\n        assert f(n)\n'),
        ['conditional-assertion-in-test:3 test_a: for'],
      ],
      [
        'an async for loop',
        inTests('async def test_a():\n    async for n in g():\n        assert n\n'),
        ['conditional-assertion-in-test:3 test_a: for'],
      ],
      [
        'a while loop',
        inTests('def test_a():\n    while f():\n        assert g()\n'),
        ['conditional-assertion-in-test:3 test_a: while'],
      ],
      [
        'an assert in an if branch',
        inTests('def test_a():\n    if f():\n        assert g()\n'),
        ['conditional-assertion-in-test:3 test_a: if'],
      ],
      [
        'an assert in an else branch',
        inTests('def test_a():\n    if f():\n        pass\n    else:\n        assert g()\n'),
        ['conditional-assertion-in-test:5 test_a: if'],
      ],
      [
        'an assert in a match case',
        inTests('def test_a():\n    match f():\n        case 1:\n            assert g()\n'),
        ['conditional-assertion-in-test:4 test_a: match'],
      ],
      [
        'an assertion call in a comprehension',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        [self.assertTrue(n) for n in f()]\n`,
        ),
        ['conditional-assertion-in-test:7 A.test_a: comprehension'],
      ],
      [
        'an assertion call in a conditional expression',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        self.assertTrue(1) if f() else None\n`,
        ),
        ['conditional-assertion-in-test:7 A.test_a: if'],
      ],
      [
        'an assertion call after and',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        f() and self.assertTrue(1)\n`,
        ),
        ['conditional-assertion-in-test:7 A.test_a: boolean'],
      ],
      [
        'an assert in an except handler',
        inTests(
          'def test_a():\n    try:\n        f()\n    except ValueError:\n        assert g()\n',
        ),
        ['conditional-assertion-in-test:5 test_a: except'],
      ],
      [
        'pytest.fail in an except handler',
        inTests(
          `${prelude}def test_a():\n    try:\n        f()\n    except ValueError:\n        pytest.fail("no")\n`,
        ),
        ['conditional-assertion-in-test:9 test_a: except'],
      ],
      [
        'self.fail in an else branch',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        if f():\n            self.fail("no")\n`,
        ),
        ['conditional-assertion-in-test:8 A.test_a: if'],
      ],
      [
        'a subTest loop',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        for n in (1, 2):\n            with self.subTest(n=n):\n                self.assertTrue(n)\n`,
        ),
        ['conditional-assertion-in-test:9 A.test_a: subTest'],
      ],
      [
        'pytest.raises in a loop',
        inTests(
          `${prelude}def test_a():\n    for n in (1, 2):\n        with pytest.raises(ValueError):\n            f(n)\n`,
        ),
        ['conditional-assertion-in-test:7 test_a: for'],
      ],
      [
        'an aliased pytest.raises in a branch',
        inTests(
          'import pytest as pt\n\n\ndef test_a():\n    if f():\n        with pt.raises(ValueError):\n            g()\n',
        ),
        ['conditional-assertion-in-test:6 test_a: if'],
      ],
      [
        'an imported assertion helper in a loop',
        inTests(
          'from assertpy import assert_that\n\n\ndef test_a():\n    for n in f():\n        assert_that(n).is_true()\n',
        ),
        ['conditional-assertion-in-test:6 test_a: for'],
      ],
      [
        'a mock assertion in a loop',
        inTests('def test_a(mock):\n    for n in f():\n        mock.assert_any_call(n)\n'),
        ['conditional-assertion-in-test:3 test_a: for'],
      ],
      [
        'a loop inside a branch is reported once, as the outer construct',
        inTests(
          'def test_a():\n    if f():\n        for n in g():\n            assert n\n            assert n > 1\n',
        ),
        ['conditional-assertion-in-test:4 test_a: if'],
      ],
      [
        'two separate loops',
        inTests(
          'def test_a():\n    for n in f():\n        assert n\n    for m in g():\n        assert m\n',
        ),
        [
          'conditional-assertion-in-test:3 test_a: for',
          'conditional-assertion-in-test:5 test_a: for',
        ],
      ],
      [
        'a method of a Test class',
        inTests('class TestA:\n    def test_a(self):\n        if f():\n            assert g()\n'),
        ['conditional-assertion-in-test:4 TestA.test_a: if'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('allows one case per test, unconditional assertions and data-building loops', () => {
    const [actual, expected] = outcomes([
      [
        'a parametrized test',
        inTests(
          `${prelude}@pytest.mark.parametrize("n", [1, 2])\ndef test_a(n):\n    assert f(n)\n`,
        ),
        [],
      ],
      [
        'a loop that only builds data before the assert',
        inTests(
          'def test_a():\n    items = []\n    for n in range(3):\n        items.append(f(n))\n    assert items == [1, 2, 3]\n',
        ),
        [],
      ],
      [
        'an assert over a generator',
        inTests('def test_a():\n    assert all(f(n) for n in range(3))\n'),
        [],
      ],
      [
        'a with block around the assert',
        inTests(
          `${prelude}def test_a():\n    with pytest.raises(ValueError) as info:\n        f()\n    assert "x" in str(info.value)\n`,
        ),
        [],
      ],
      [
        'an assert in a try body and a finally block',
        inTests('def test_a():\n    try:\n        assert f()\n    finally:\n        assert g()\n'),
        [],
      ],
      [
        'a conditional pytest.skip',
        inTests(
          `${prelude}def test_a():\n    if f():\n        pytest.skip("not here")\n    assert g()\n`,
        ),
        [],
      ],
      [
        'a conditional self.skipTest',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        if f():\n            self.skipTest("not here")\n        self.assertTrue(g())\n`,
        ),
        [],
      ],
      [
        'a branch without an assertion',
        inTests(
          'def test_a():\n    if f():\n        x = 1\n    else:\n        x = 2\n    assert x\n',
        ),
        [],
      ],
      [
        'an assertion on the caught exception, which ruff PT017 reports',
        inTests(
          'def test_a():\n    try:\n        f()\n    except ValueError as error:\n        assert "x" in str(error)\n',
        ),
        [],
      ],
      [
        'a helper outside the tests that loops over cases',
        inTests(
          'def check_all(cases):\n    for case in cases:\n        assert f(case)\n\n\ndef test_a():\n    check_all([1, 2])\n',
        ),
        [],
      ],
      [
        'a nested helper that loops',
        inTests(
          'def test_a():\n    def check(cases):\n        for case in cases:\n            assert f(case)\n\n    check([1])\n',
        ),
        [],
      ],
      [
        'a loop in a helper, not in a test file',
        { file: 'src/mod.py', code: 'def test_a():\n    for n in f():\n        assert n\n' },
        [],
      ],
      [
        'a function that is not a test',
        inTests('def check_a():\n    for n in f():\n        assert n\n'),
        [],
      ],
      [
        'a fixture',
        inTests(
          `${prelude}@pytest.fixture\ndef a():\n    for n in f():\n        assert n\n    return 1\n`,
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
