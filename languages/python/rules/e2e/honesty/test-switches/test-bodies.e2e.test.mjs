import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['conditional-assertion-in-test', 'switched-off-test'],
});
afterEach(cleanup);

const inTests = (code) => ({ file: 'tests/test_a.py', code });
const RULE = 'test-without-assertion';
const nested = 'def test_a():\n    def check(x):\n        assert x\n\n';
const helper = 'def check_it(x):\n    assert x\n\n\n';

describe.skipIf(!enabled)('test-without-assertion: nested functions and same-file helpers', () => {
  it('counts a nested function only when the test calls it', () => {
    const [actual, expected] = outcomes([
      ['a nested function that is called', inTests(`${nested}    check(1)\n`), []],
      [
        'a nested function that is never called',
        inTests(`${nested}    f()\n`),
        [`${RULE}:1 test_a`],
      ],
      ['a nested function that only stands next to a call', inTests(`${nested}    f(check)\n`), []],
      [
        'a nested function called inside a branch',
        inTests(`${nested}    if f():\n        check(1)\n`),
        [],
      ],
      ['a nested function handed to map', inTests(`${nested}    list(map(check, f()))\n`), []],
      [
        'a nested async function that asyncio runs',
        inTests(
          'import asyncio\n\n\ndef test_a():\n    async def main():\n        assert await f()\n\n    asyncio.run(main())\n',
        ),
        [],
      ],
      [
        'a lambda that nothing calls',
        inTests('def test_a(self):\n    check = lambda n: self.assertTrue(n)\n    f()\n'),
        [`${RULE}:1 test_a`],
      ],
      [
        'a lambda that is called',
        inTests('def test_a(self):\n    check = lambda n: self.assertTrue(n)\n    check(1)\n'),
        [],
      ],
      [
        'an assertion in a nested class method',
        inTests(
          'def test_a():\n    class Fake:\n        def run(self):\n            assert f()\n\n    f()\n',
        ),
        [`${RULE}:1 test_a`],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('counts a function of the same file that asserts', () => {
    const [actual, expected] = outcomes([
      ['a helper the test calls', inTests(`${helper}def test_a():\n    check_it(f())\n`), []],
      [
        'a helper handed to map',
        inTests(`${helper}def test_a():\n    list(map(check_it, f()))\n`),
        [],
      ],
      [
        'a helper called through a method of the class',
        inTests(
          'class TestA:\n    def _check(self, x):\n        assert x\n\n    def test_a(self):\n        self._check(f())\n',
        ),
        [],
      ],
      [
        'a helper that raises AssertionError',
        inTests(
          'def check_it(x):\n    if not x:\n        raise AssertionError(x)\n\n\ndef test_a():\n    check_it(f())\n',
        ),
        [],
      ],
      [
        'a helper that only calls pytest.fail',
        inTests(
          'import pytest\n\n\ndef check_it(x):\n    if not x:\n        pytest.fail("no")\n\n\ndef test_a():\n    check_it(f())\n',
        ),
        [],
      ],
      [
        'a function that does not assert',
        inTests('def build(x):\n    return x\n\n\ndef test_a():\n    build(f())\n'),
        [`${RULE}:5 test_a`],
      ],
      [
        'a helper that is never called',
        inTests(`${helper}def test_a():\n    f()\n`),
        [`${RULE}:5 test_a`],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)(
  'test-without-assertion: tests found in blocks and nested classes',
  () => {
    it('finds a test the way pytest collects it', () => {
      const [actual, expected] = outcomes([
        [
          'a module level if',
          inTests('import sys\n\nif sys.platform == "linux":\n\n    def test_a():\n        f()\n'),
          [`${RULE}:5 test_a`],
        ],
        [
          'a nested test class',
          inTests(
            'class TestOuter:\n    class TestInner:\n        def test_a(self):\n            f()\n',
          ),
          [`${RULE}:3 TestOuter.TestInner.test_a`],
        ],
        [
          'a class that pytest does not collect',
          inTests('class Helper:\n    def test_a(self):\n        f()\n'),
          [],
        ],
      ]);

      expect(actual).toEqual(expected);
    });
  },
);
