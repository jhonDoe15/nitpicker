import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts({
  hidden: ['test-without-assertion', 'skipped-test-without-reason'],
});
afterEach(cleanup);

const inTests = (code, file = 'tests/test_a.py') => ({ file, code });
const prelude = 'import pytest\nimport sys\nimport unittest\n\n\n';
const test = '\ndef test_a():\n    assert f()\n';

describe.skipIf(!enabled)('switched-off-test', () => {
  it('flags a test that never runs or can never fail', () => {
    const [actual, expected] = outcomes([
      [
        'a skip mark with a reason',
        inTests(`${prelude}@pytest.mark.skip(reason="later")${test}`),
        ['switched-off-test:6 pytest.mark.skip'],
      ],
      [
        'a skip mark with a positional reason',
        inTests(`${prelude}@pytest.mark.skip("later")${test}`),
        ['switched-off-test:6 pytest.mark.skip'],
      ],
      [
        'a skip mark on a class',
        inTests(
          `${prelude}@pytest.mark.skip(reason="later")\nclass TestA:\n    def test_a(self):\n        assert f()\n`,
        ),
        ['switched-off-test:6 pytest.mark.skip'],
      ],
      [
        'a module level skip mark',
        inTests(`${prelude}pytestmark = [pytest.mark.skip(reason="later")]\n`),
        ['switched-off-test:6 pytest.mark.skip'],
      ],
      [
        'an aliased module and an imported mark',
        inTests(
          'import pytest as pt\nfrom pytest import mark\n\n\n@pt.mark.skip(reason="a")\ndef test_a():\n    assert f()\n\n\n@mark.skip(reason="b")\ndef test_b():\n    assert f()\n',
        ),
        ['switched-off-test:5 pytest.mark.skip', 'switched-off-test:10 pytest.mark.skip'],
      ],
      [
        'a skipped parameter',
        inTests(
          `${prelude}@pytest.mark.parametrize("n", [1, pytest.param(2, marks=pytest.mark.skip(reason="a"))])\ndef test_a(n):\n    assert f(n)\n`,
        ),
        ['switched-off-test:6 pytest.mark.skip'],
      ],
      [
        'skipif with True',
        inTests(`${prelude}@pytest.mark.skipif(True, reason="later")${test}`),
        ['switched-off-test:6 pytest.mark.skipif(literal)'],
      ],
      [
        'skipif with a condition keyword set to a string literal',
        inTests(`${prelude}@pytest.mark.skipif(condition="True", reason="later")${test}`),
        ['switched-off-test:6 pytest.mark.skipif(literal)'],
      ],
      [
        'skipif with False',
        inTests(`${prelude}@pytest.mark.skipif(False, reason="never")${test}`),
        ['switched-off-test:6 pytest.mark.skipif(literal)'],
      ],
      [
        'xfail without strict',
        inTests(`${prelude}@pytest.mark.xfail(reason="bug 1")${test}`),
        ['switched-off-test:6 pytest.mark.xfail'],
      ],
      [
        'xfail with strict False',
        inTests(`${prelude}@pytest.mark.xfail(reason="bug 1", strict=False)${test}`),
        ['switched-off-test:6 pytest.mark.xfail'],
      ],
      [
        'xfail with the expected error but not strict',
        inTests(`${prelude}@pytest.mark.xfail(raises=ValueError)${test}`),
        ['switched-off-test:6 pytest.mark.xfail'],
      ],
      [
        'xfail that does not run the test',
        inTests(`${prelude}@pytest.mark.xfail(reason="bug 1", strict=True, run=False)${test}`),
        ['switched-off-test:6 pytest.mark.xfail(run=False)'],
      ],
      [
        'a unittest skip with a reason',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    @unittest.skip("later")\n    def test_a(self):\n        self.assertTrue(f())\n`,
        ),
        ['switched-off-test:7 unittest.skip'],
      ],
      [
        'a unittest skip on a class',
        inTests(
          `${prelude}@unittest.skip("later")\nclass A(unittest.TestCase):\n    def test_a(self):\n        self.assertTrue(f())\n`,
        ),
        ['switched-off-test:6 unittest.skip'],
      ],
      [
        'a unittest skipIf with True',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    @unittest.skipIf(True, "later")\n    def test_a(self):\n        self.assertTrue(f())\n`,
        ),
        ['switched-off-test:7 unittest.skipIf(literal)'],
      ],
      [
        'a unittest skipUnless with False',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    @unittest.skipUnless(False, "later")\n    def test_a(self):\n        self.assertTrue(f())\n`,
        ),
        ['switched-off-test:7 unittest.skipUnless(literal)'],
      ],
      [
        'pytest.skip as a statement of the test',
        inTests(`${prelude}def test_a():\n    pytest.skip("later")\n    assert f()\n`),
        ['switched-off-test:7 pytest.skip()'],
      ],
      [
        'pytest.skip after setup',
        inTests(`${prelude}def test_a():\n    x = f()\n    pytest.skip(reason="later")\n`),
        ['switched-off-test:8 pytest.skip()'],
      ],
      [
        'pytest.xfail as a statement of the test',
        inTests(`${prelude}def test_a():\n    pytest.xfail("later")\n`),
        ['switched-off-test:7 pytest.xfail()'],
      ],
      [
        'a module level skip',
        inTests(`${prelude}pytest.skip("later", allow_module_level=True)\n`),
        ['switched-off-test:6 pytest.skip()'],
      ],
      [
        'self.skipTest as a statement of the test',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        self.skipTest("later")\n`,
        ),
        ['switched-off-test:8 skipTest()'],
      ],
      [
        'raise SkipTest with a message',
        inTests(`${prelude}def test_a():\n    raise unittest.SkipTest("later")\n`),
        ['switched-off-test:7 SkipTest'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('allows a skip on a real condition and a strict xfail', () => {
    const [actual, expected] = outcomes([
      [
        'skipif on the platform',
        inTests(
          `${prelude}@pytest.mark.skipif(sys.platform == "win32", reason="posix only")${test}`,
        ),
        [],
      ],
      [
        'skipif on a string condition',
        inTests(`${prelude}@pytest.mark.skipif("sys.platform == 'win32'", reason="posix")${test}`),
        [],
      ],
      [
        'skipif on a flag the module computes',
        inTests(
          `${prelude}HAS_DATABASE = f()\n\n\n@pytest.mark.skipif(not HAS_DATABASE, reason="needs it")${test}`,
        ),
        [],
      ],
      [
        'a skipped parameter on a real condition',
        inTests(
          `${prelude}@pytest.mark.parametrize("n", [1, pytest.param(2, marks=pytest.mark.skipif(sys.platform == "win32", reason="a"))])\ndef test_a(n):\n    assert f(n)\n`,
        ),
        [],
      ],
      [
        'a strict xfail',
        inTests(`${prelude}@pytest.mark.xfail(reason="bug 1", strict=True)${test}`),
        [],
      ],
      [
        'a strict xfail with the expected error',
        inTests(
          `${prelude}@pytest.mark.xfail(reason="bug 1", raises=ValueError, strict=True)${test}`,
        ),
        [],
      ],
      [
        'a strict xfail through a variable',
        inTests(
          `${prelude}STRICT = True\n\n\n@pytest.mark.xfail(reason="bug", strict=STRICT)${test}`,
        ),
        [],
      ],
      [
        'a conditional pytest.skip',
        inTests(
          `${prelude}def test_a():\n    if sys.platform == "win32":\n        pytest.skip("posix only")\n    assert f()\n`,
        ),
        [],
      ],
      [
        'a conditional module level skip',
        inTests(
          `${prelude}if sys.platform == "win32":\n    pytest.skip("posix only", allow_module_level=True)\n`,
        ),
        [],
      ],
      [
        'importorskip',
        inTests(
          `${prelude}def test_a():\n    numpy = pytest.importorskip("numpy")\n    assert numpy\n`,
        ),
        [],
      ],
      [
        'a unittest skipUnless on a real condition',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    @unittest.skipUnless(sys.platform == "linux", "linux only")\n    def test_a(self):\n        self.assertTrue(f())\n`,
        ),
        [],
      ],
      [
        'a conditional self.skipTest',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def test_a(self):\n        if f():\n            self.skipTest("later")\n        self.assertTrue(g())\n`,
        ),
        [],
      ],
      [
        'a skip helper that is not a test',
        inTests(`${prelude}def skip_on_ci():\n    pytest.skip("ci")\n`),
        [],
      ],
      [
        'a skip outside a test file',
        {
          file: 'src/mod.py',
          code: 'import pytest\n\npytest.skip("later", allow_module_level=True)\n',
        },
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('treats xfail as strict when the pytest configuration sets xfail_strict', () => {
    const files = {
      'pytest.ini': '[pytest]\nxfail_strict = true\n',
      'tests/test_a.py': `${prelude}@pytest.mark.xfail(reason="bug 1")${test}\n\n@pytest.mark.xfail(reason="bug 2", strict=False)${test.replace('test_a', 'test_b')}`,
    };

    expect(findingsOf(files).filter((line) => line.startsWith('switched-off-test '))).toEqual([
      'switched-off-test tests/test_a.py:11 pytest.mark.xfail',
    ]);
  });
});
