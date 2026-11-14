import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: [
    'test-without-assertion',
    'switched-off-test',
    'tautological-assert',
    'swallowed-exception',
    'weak-assertion',
  ],
});
afterEach(cleanup);

const inTests = (code) => ({ file: 'tests/test_a.py', code });
const prelude = 'import unittest\n\n\n';
const subTests = (table) =>
  `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        for n in ${table}:\n            with self.subTest(n=n):\n                self.assertTrue(n)\n`;

describe.skipIf(!enabled)('conditional-assertion-in-test loops', () => {
  it('reports a loop in a helper that a test calls', () => {
    const [actual, expected] = outcomes([
      [
        'a module-level helper with a loop',
        inTests(
          'def check_all(cases):\n    for case in cases:\n        assert f(case)\n\n\ndef test_a():\n    check_all([1, 2])\n',
        ),
        ['conditional-assertion-in-test:3 test_a: for'],
      ],
      [
        'a helper that calls a helper with a loop',
        inTests(
          'def check_all(cases):\n    for case in cases:\n        assert f(case)\n\n\ndef outer():\n    check_all([1])\n\n\ndef test_a():\n    outer()\n',
        ),
        ['conditional-assertion-in-test:3 test_a: for'],
      ],
      [
        'a method of the test class with a loop',
        inTests(
          'class TestA:\n    def check_all(self, cases):\n        for case in cases:\n            assert f(case)\n\n    def test_a(self):\n        self.check_all([1])\n',
        ),
        ['conditional-assertion-in-test:4 TestA.test_a: for'],
      ],
      [
        'a comprehension in a method of a unittest class',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def check_all(self, cases):\n        [self.assertTrue(c) for c in cases]\n\n    def test_a(self):\n        self.check_all([1])\n`,
        ),
        ['conditional-assertion-in-test:6 A.test_a: comprehension (unittest)'],
      ],
      [
        'a recursive helper',
        inTests(
          'def walk(nodes):\n    for node in nodes:\n        assert node\n        walk(node.children)\n\n\ndef test_a():\n    walk(tree())\n',
        ),
        ['conditional-assertion-in-test:3 test_a: for'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('allows helpers without loops, loops that cannot run zero times and literal subtest tables', () => {
    const [actual, expected] = outcomes([
      [
        'a helper that asserts unconditionally',
        inTests('def check(x):\n    assert x == 1\n\n\ndef test_a():\n    check(f())\n'),
        [],
      ],
      [
        'a helper whose loop only builds data',
        inTests(
          'def check(xs):\n    items = []\n    for x in xs:\n        items.append(x)\n    assert items == [1]\n\n\ndef test_a():\n    check(f())\n',
        ),
        [],
      ],
      [
        'a range with a literal count',
        inTests('def test_a():\n    for n in range(3):\n        assert tick(n) == n\n'),
        [],
      ],
      [
        'a range with literal bounds and a step in a helper',
        inTests(
          'def check():\n    for n in range(1, 10, 3):\n        assert tick(n) == n\n\n\ndef test_a():\n    check()\n',
        ),
        [],
      ],
      [
        'a comprehension over a literal range',
        inTests('def test_a():\n    [check(n) for n in range(3)]\n    assert f()\n'),
        [],
      ],
      ['a subTest loop over a literal table', inTests(subTests('(1, 2)')), []],
      [
        'a subTest loop over an annotated module-level table',
        inTests(`CASES: list[int] = [1, 2]\n\n\n${subTests('CASES')}`),
        [],
      ],
      [
        'a subTest loop over a module-level literal table',
        inTests(`CASES = [1, 2]\n\n\n${subTests('CASES')}`),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('reports a range that can be empty, a non-literal count and a subTest loop over a collection', () => {
    const [actual, expected] = outcomes([
      [
        'range(0)',
        inTests('def test_a():\n    for n in range(0):\n        assert tick(n)\n'),
        ['conditional-assertion-in-test:3 test_a: for'],
      ],
      [
        'a range with a variable count',
        inTests('def test_a():\n    for n in range(count()):\n        assert tick(n)\n'),
        ['conditional-assertion-in-test:3 test_a: for'],
      ],
      [
        'a for loop over a literal table without subTest',
        inTests('def test_a():\n    for n in (1, 2):\n        assert tick(n)\n'),
        ['conditional-assertion-in-test:3 test_a: for'],
      ],
      [
        'a subTest loop over a call result',
        inTests(subTests('cases()')),
        ['conditional-assertion-in-test:8 A.test_a: subTest (unittest)'],
      ],
      [
        'a subTest loop over an empty literal',
        inTests(subTests('[]')),
        ['conditional-assertion-in-test:8 A.test_a: subTest (unittest)'],
      ],
      [
        'a table that is cleared',
        inTests(`CASES = [1, 2]\nCASES.clear()\n\n\n${subTests('CASES')}`),
        ['conditional-assertion-in-test:12 A.test_a: subTest (unittest)'],
      ],
      [
        'a table that is rebound',
        inTests(`CASES = [1, 2]\nCASES = load()\n\n\n${subTests('CASES')}`),
        ['conditional-assertion-in-test:12 A.test_a: subTest (unittest)'],
      ],
      [
        'a table that a test parameter shadows',
        inTests(
          `CASES = [1, 2]\n\n\n${prelude}class A(unittest.TestCase):\n    def test_a(self, CASES):\n        for n in CASES:\n            with self.subTest(n=n):\n                self.assertTrue(n)\n`,
        ),
        ['conditional-assertion-in-test:11 A.test_a: subTest (unittest)'],
      ],
      [
        'a table with an unpacked element',
        inTests(subTests('[*cases()]')),
        ['conditional-assertion-in-test:8 A.test_a: subTest (unittest)'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
