import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['test-without-assertion', 'conditional-assertion-in-test', 'swallowed-exception'],
});
afterEach(cleanup);

const inTests = (code, file = 'tests/test_a.py') => ({ file, code });
const conftest = (code) => inTests(code, 'tests/conftest.py');
const prelude = 'import pytest\nimport sys\nimport unittest\n\n\n';
const OFF = 'switched-off-test';
const test = 'def test_a():\n    assert f()\n';
const SKIP = 'pytest.mark.skip';
const OFF_MARK = 'OFF = pytest.mark.skip(reason="x")\n\n\n';

describe.skipIf(!enabled)('switched-off-test: marks held in variables or added by hooks', () => {
  it('follows a mark through a variable', () => {
    const [actual, expected] = outcomes([
      ['a decorator variable', inTests(`${prelude}${OFF_MARK}@OFF\n${test}`), [`${OFF}:9 ${SKIP}`]],
      [
        'a variable used as pytestmark',
        inTests(`${prelude}${OFF_MARK}pytestmark = OFF\n`),
        [`${OFF}:9 ${SKIP}`],
      ],
      [
        'a variable used as the marks of a parameter',
        inTests(
          `${prelude}${OFF_MARK}@pytest.mark.parametrize("n", [pytest.param(1, marks=OFF)])\ndef test_a(n):\n    assert f(n)\n`,
        ),
        [`${OFF}:9 ${SKIP}`],
      ],
      [
        'a list of marks',
        inTests(`${prelude}MARKS = [pytest.mark.skip(reason="a")]\npytestmark = MARKS\n`),
        [`${OFF}:7 ${SKIP}`],
      ],
      [
        'an annotated pytestmark',
        inTests(`${prelude}pytestmark: list = [pytest.mark.skip(reason="x")]\n`),
        [`${OFF}:6 ${SKIP}`],
      ],
      [
        'an augmented pytestmark',
        inTests(`${prelude}pytestmark = []\npytestmark += [pytest.mark.skip(reason="x")]\n`),
        [`${OFF}:7 ${SKIP}`],
      ],
      ['a variable that nothing uses', inTests(`${prelude}${OFF_MARK}${test}`), []],
      [
        'a variable that holds a real condition',
        inTests(
          `${prelude}ON = pytest.mark.skipif(sys.platform == "win32", reason="x")\n\n\n@ON\n${test}`,
        ),
        [],
      ],
      [
        'a variable that holds a skip without a reason',
        inTests(`${prelude}OFF = pytest.mark.skip()\n\n\n@OFF\n${test}`),
        ['skipped-test-without-reason:9 pytest.mark.skip'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('reports a mark that a hook or a fixture adds to every test', () => {
    const [actual, expected] = outcomes([
      [
        'add_marker in a collection hook',
        conftest(
          `${prelude}def pytest_collection_modifyitems(items):\n    for item in items:\n        item.add_marker(pytest.mark.skip(reason="x"))\n`,
        ),
        [`${OFF}:8 ${SKIP}`],
      ],
      [
        'add_marker of a variable',
        conftest(
          `${prelude}${OFF_MARK}def pytest_collection_modifyitems(items):\n    for item in items:\n        item.add_marker(OFF)\n`,
        ),
        [`${OFF}:11 ${SKIP}`],
      ],
      [
        'add_marker behind a real condition',
        conftest(
          `${prelude}SLOW = pytest.mark.skip(reason="needs --runslow")\n\n\ndef pytest_collection_modifyitems(config, items):\n    for item in items:\n        if "slow" in item.keywords:\n            item.add_marker(SLOW)\n`,
        ),
        [],
      ],
      [
        'applymarker in a fixture',
        inTests(
          `${prelude}@pytest.fixture\ndef a(request):\n    request.applymarker(pytest.mark.skip(reason="x"))\n`,
        ),
        [`${OFF}:8 ${SKIP}`],
      ],
      [
        'node.add_marker in a test',
        inTests(
          `${prelude}def test_a(request):\n    request.node.add_marker(pytest.mark.skip(reason="x"))\n    assert f()\n`,
        ),
        [`${OFF}:7 ${SKIP}`],
      ],
      [
        'a non-strict xfail added by a hook',
        conftest(
          `${prelude}def pytest_collection_modifyitems(items):\n    for item in items:\n        item.add_marker(pytest.mark.xfail(reason="x"))\n`,
        ),
        [`${OFF}:8 pytest.mark.xfail`],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('switched-off-test: skips outside the top of a test', () => {
  it('reports an unconditional skip in a fixture, a hook, a setup method or a nested block', () => {
    const [actual, expected] = outcomes([
      [
        'an autouse fixture',
        inTests(
          `${prelude}@pytest.fixture(autouse=True)\ndef skip_all():\n    pytest.skip("later")\n`,
        ),
        [`${OFF}:8 pytest.skip()`],
      ],
      [
        'a fixture',
        inTests(`${prelude}@pytest.fixture\ndef database():\n    pytest.skip("later")\n`),
        [`${OFF}:8 pytest.skip()`],
      ],
      [
        'a setup hook of conftest',
        conftest(`${prelude}def pytest_runtest_setup(item):\n    pytest.skip("later")\n`),
        [`${OFF}:7 pytest.skip()`],
      ],
      [
        'setUp',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def setUp(self):\n        self.skipTest("later")\n`,
        ),
        [`${OFF}:8 skipTest()`],
      ],
      [
        'setUpClass',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    @classmethod\n    def setUpClass(cls):\n        raise unittest.SkipTest("later")\n`,
        ),
        [`${OFF}:9 SkipTest`],
      ],
      [
        'a with block',
        inTests(`${prelude}def test_a():\n    with open("f"):\n        pytest.skip("later")\n`),
        [`${OFF}:8 pytest.skip()`],
      ],
      [
        'a try block',
        inTests(
          `${prelude}def test_a():\n    try:\n        pytest.skip("later")\n    except OSError:\n        pass\n`,
        ),
        [`${OFF}:8 pytest.skip()`],
      ],
      [
        'a loop',
        inTests(`${prelude}def test_a():\n    for n in f():\n        pytest.skip("later")\n`),
        [`${OFF}:8 pytest.skip()`],
      ],
      [
        'both branches of an if',
        inTests(
          `${prelude}def test_a():\n    if f():\n        pytest.skip("a")\n    else:\n        pytest.skip("b")\n`,
        ),
        [`${OFF}:8 pytest.skip()`],
      ],
      [
        'every branch of an elif chain',
        inTests(
          `${prelude}def test_a(x):\n    if x == 1:\n        pytest.skip("a")\n    elif x == 2:\n        pytest.skip("b")\n    else:\n        pytest.skip("c")\n`,
        ),
        [`${OFF}:8 pytest.skip()`],
      ],
      [
        'a literal true condition',
        inTests(`${prelude}def test_a():\n    if True:\n        pytest.skip("later")\n`),
        [`${OFF}:8 pytest.skip()`],
      ],
      [
        'a literal number as the condition',
        inTests(`${prelude}def test_a():\n    if 1:\n        pytest.skip("later")\n`),
        [`${OFF}:8 pytest.skip()`],
      ],
      [
        'a literal false condition with a skip in the else',
        inTests(
          `${prelude}def test_a():\n    if False:\n        assert f()\n    else:\n        pytest.skip("later")\n`,
        ),
        [`${OFF}:10 pytest.skip()`],
      ],
      [
        'a module level skip under a literal condition',
        inTests(`${prelude}if True:\n    pytest.skip("later", allow_module_level=True)\n`),
        [`${OFF}:7 pytest.skip()`],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('allows a skip that depends on a real condition', () => {
    const [actual, expected] = outcomes([
      [
        'one branch only',
        inTests(`${prelude}def test_a():\n    if f():\n        pytest.skip("a")\n    assert g()\n`),
        [],
      ],
      [
        'a branch on the platform',
        inTests(
          `${prelude}def test_a():\n    if sys.platform == "win32":\n        pytest.skip("posix")\n    assert g()\n`,
        ),
        [],
      ],
      [
        'an if with an else that does something else',
        inTests(
          `${prelude}def test_a():\n    if f():\n        pytest.skip("a")\n    else:\n        g()\n`,
        ),
        [],
      ],
      [
        'a literal false condition',
        inTests(
          `${prelude}def test_a():\n    if False:\n        pytest.skip("never")\n    assert g()\n`,
        ),
        [],
      ],
      [
        'a conditional fixture skip',
        inTests(
          `${prelude}@pytest.fixture\ndef a():\n    if not f():\n        pytest.skip("no")\n`,
        ),
        [],
      ],
      [
        'a conditional setUp skip',
        inTests(
          `${prelude}class A(unittest.TestCase):\n    def setUp(self):\n        if not f():\n            self.skipTest("no")\n`,
        ),
        [],
      ],
      [
        'a conditional module level skip',
        inTests(
          `${prelude}if sys.platform == "win32":\n    pytest.skip("posix", allow_module_level=True)\n`,
        ),
        [],
      ],
      [
        'a helper that skips for its callers',
        inTests(`${prelude}def skip_on_ci():\n    pytest.skip("ci")\n`),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('switched-off-test: any reason, and literal strict values', () => {
  it('reports a permanent skip whatever its reason', () => {
    const [actual, expected] = outcomes([
      [
        'a short reason',
        inTests(`${prelude}@pytest.mark.skip(reason="todo")\n${test}`),
        [`${OFF}:6 ${SKIP}`],
      ],
      ['a dot', inTests(`${prelude}@pytest.mark.skip(reason=".")\n${test}`), [`${OFF}:6 ${SKIP}`]],
      [
        'a variable',
        inTests(`${prelude}REASON = "later"\n\n\n@pytest.mark.skip(reason=REASON)\n${test}`),
        [`${OFF}:9 ${SKIP}`],
      ],
      [
        'an f-string',
        inTests(`${prelude}@pytest.mark.skip(reason=f"{f()}")\n${test}`),
        [`${OFF}:6 ${SKIP}`],
      ],
      [
        'a positional reason',
        inTests(`${prelude}@pytest.mark.skip("whatever")\n${test}`),
        [`${OFF}:6 ${SKIP}`],
      ],
      [
        'an empty reason is left to the reason rule',
        inTests(`${prelude}@pytest.mark.skip(reason="")\n${test}`),
        ['skipped-test-without-reason:6 pytest.mark.skip'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('treats a falsy strict value as not strict', () => {
    const xfail = (strict) =>
      inTests(`${prelude}@pytest.mark.xfail(reason="bug", strict=${strict})\n${test}`);
    const [actual, expected] = outcomes([
      ['strict 0', xfail('0'), [`${OFF}:6 pytest.mark.xfail`]],
      ['strict None', xfail('None'), [`${OFF}:6 pytest.mark.xfail`]],
      ['strict an empty string', xfail('""'), [`${OFF}:6 pytest.mark.xfail`]],
      ['strict not True', xfail('not True'), [`${OFF}:6 pytest.mark.xfail`]],
      ['strict False', xfail('False'), [`${OFF}:6 pytest.mark.xfail`]],
      ['strict 1', xfail('1'), []],
      ['strict True', xfail('True'), []],
      ['strict not False', xfail('not False'), []],
      ['strict from a call', xfail('is_strict()'), []],
    ]);

    expect(actual).toEqual(expected);
  });
});
