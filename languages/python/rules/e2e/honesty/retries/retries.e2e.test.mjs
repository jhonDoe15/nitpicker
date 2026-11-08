import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, single } = createScripts();
afterEach(cleanup);

const TEST_FILE = 'tests/test_mod.py';
const RULE = 'retry-in-test';
const retries = (code, file = TEST_FILE) =>
  single(code, file).filter((finding) => finding.startsWith(`${RULE} `));
const at = (line, subject) => `${RULE} ${TEST_FILE}:${String(line)} ${subject}`;

describe.skipIf(!enabled)(RULE, () => {
  it.each([
    [
      'a pytest-rerunfailures mark',
      'import pytest\n@pytest.mark.flaky(reruns=3)\ndef test_a():\n    pass\n',
      [at(2, 'pytest.mark.flaky')],
    ],
    [
      'a bare flaky mark',
      'import pytest\n@pytest.mark.flaky\ndef test_a():\n    pass\n',
      [at(2, 'pytest.mark.flaky')],
    ],
    [
      'a pytest-retry mark through an imported mark',
      'from pytest import mark\n@mark.flaky(retries=2)\ndef test_a():\n    pass\n',
      [at(2, 'pytest.mark.flaky')],
    ],
    [
      'a module pytestmark list',
      'import pytest\npytestmark = [pytest.mark.slow, pytest.mark.flaky(reruns=1)]\n',
      [at(2, 'pytest.mark.flaky')],
    ],
    [
      'a mark on a parameter',
      'import pytest\n@pytest.mark.parametrize("x", [pytest.param(1, marks=pytest.mark.flaky)])\ndef test_a(x):\n    pass\n',
      [at(2, 'pytest.mark.flaky')],
    ],
    [
      'a mark added at run time',
      'import pytest\ndef test_a(request):\n    request.node.add_marker(pytest.mark.flaky(reruns=2))\n',
      [at(3, 'pytest.mark.flaky')],
    ],
    [
      'the flaky package decorator',
      'from flaky import flaky\n@flaky\ndef test_a():\n    pass\n',
      [at(2, 'flaky.flaky')],
    ],
    [
      'the flaky package decorator with a run count, on a class',
      'import flaky\n@flaky.flaky(max_runs=3)\nclass TestOrders:\n    def test_a(self):\n        pass\n',
      [at(2, 'flaky.flaky')],
    ],
    [
      'a tenacity retry on a test',
      'from tenacity import retry, stop_after_attempt\n@retry(stop=stop_after_attempt(3))\ndef test_a():\n    pass\n',
      [at(2, 'tenacity.retry on test_a')],
    ],
    [
      'a backoff retry on a test method',
      'import backoff\nclass TestA:\n    @backoff.on_exception(backoff.expo, AssertionError, max_tries=3)\n    def test_a(self):\n        pass\n',
      [at(3, 'backoff.on_exception on test_a')],
    ],
  ])('reports %s', (_name, code, expected) => {
    expect(retries(code)).toEqual(expected);
  });

  it.each([
    ['reruns switched off', 'import pytest\n@pytest.mark.flaky(reruns=0)\ndef test_a():\n    pass\n'],
    ['retries switched off', 'import pytest\n@pytest.mark.flaky(retries=0)\ndef test_a():\n    pass\n'],
    ['a single flaky run', 'from flaky import flaky\n@flaky(max_runs=1)\ndef test_a():\n    pass\n'],
    [
      'a tenacity retry on a helper that polls',
      'from tenacity import retry\n@retry\ndef wait_ready():\n    pass\ndef test_a():\n    wait_ready()\n',
    ],
    ['another mark', 'import pytest\n@pytest.mark.slow\ndef test_a():\n    pass\n'],
    ['a local name flaky', 'def flaky():\n    pass\ndef test_a():\n    flaky()\n'],
  ])('allows %s', (_name, code) => {
    expect(retries(code)).toEqual([]);
  });

  it('checks only test files', () => {
    expect(
      retries('import pytest\nflaky = pytest.mark.flaky(reruns=2)\n', 'src/shop/marks.py'),
    ).toEqual([]);
  });

  it('checks conftest.py', () => {
    expect(
      retries(
        'import pytest\ndef pytest_collection_modifyitems(items):\n    for item in items:\n        item.add_marker(pytest.mark.flaky(reruns=1))\n',
        'tests/conftest.py',
      ),
    ).toEqual([`${RULE} tests/conftest.py:4 pytest.mark.flaky`]);
  });
});
