import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const inTests = (code, file = 'tests/test_a.py') => ({ file, code });

describe.skipIf(!enabled)('skipped-test-without-reason', () => {
  it('flags a skip or xfail that gives no reason', () => {
    const [actual, expected] = outcomes([
      [
        'a bare skip mark',
        inTests('import pytest\n\n\n@pytest.mark.skip\ndef test_a():\n    assert f()\n'),
        ['skipped-test-without-reason:4 pytest.mark.skip'],
      ],
      [
        'a skip call without arguments',
        inTests('import pytest\n\n\n@pytest.mark.skip()\ndef test_a():\n    assert f()\n'),
        ['skipped-test-without-reason:4 pytest.mark.skip'],
      ],
      [
        'xfail',
        inTests('import pytest\n\n\n@pytest.mark.xfail\ndef test_a():\n    assert f()\n'),
        ['skipped-test-without-reason:4 pytest.mark.xfail'],
      ],
      [
        'xfail with a condition only',
        inTests(
          'import pytest\n\n\n@pytest.mark.xfail(strict=True)\ndef test_a():\n    assert f()\n',
        ),
        ['skipped-test-without-reason:4 pytest.mark.xfail'],
      ],
      [
        'skipif with a condition only',
        inTests(
          'import pytest\n\n\n@pytest.mark.skipif(sys.platform == "win32")\ndef test_a():\n    assert f()\n',
        ),
        ['skipped-test-without-reason:4 pytest.mark.skipif'],
      ],
      [
        'pytest.skip() in a test',
        inTests('import pytest\n\n\ndef test_a():\n    pytest.skip()\n'),
        ['skipped-test-without-reason:5 pytest.skip()'],
      ],
      [
        'pytest.xfail() in a test',
        inTests('import pytest\n\n\ndef test_a():\n    pytest.xfail()\n'),
        ['skipped-test-without-reason:5 pytest.xfail()'],
      ],
      [
        'a module level mark',
        inTests('import pytest\n\npytestmark = pytest.mark.skip\n'),
        ['skipped-test-without-reason:3 pytest.mark.skip'],
      ],
      [
        'an alias of the module',
        inTests('import pytest as pt\n\n\n@pt.mark.skip\ndef test_a():\n    assert f()\n'),
        ['skipped-test-without-reason:4 pytest.mark.skip'],
      ],
      [
        'a reason keyword',
        inTests(
          'import pytest\n\n\n@pytest.mark.skip(reason="needs a database")\ndef test_a():\n    assert f()\n',
        ),
        [],
      ],
      [
        'a positional reason',
        inTests(
          'import pytest\n\n\n@pytest.mark.skip("needs a database")\ndef test_a():\n    assert f()\n',
        ),
        [],
      ],
      [
        'skipif with a reason',
        inTests(
          'import pytest\n\n\n@pytest.mark.skipif(sys.platform == "win32", reason="posix only")\ndef test_a():\n    assert f()\n',
        ),
        [],
      ],
      [
        'pytest.skip with a message',
        inTests('import pytest\n\n\ndef test_a():\n    pytest.skip("no database")\n'),
        [],
      ],
      [
        'pytest.skip with a reason keyword',
        inTests('import pytest\n\n\ndef test_a():\n    pytest.skip(reason="no database")\n'),
        [],
      ],
      [
        'a mark of another name',
        inTests('import pytest\n\n\n@pytest.mark.slow\ndef test_a():\n    assert f()\n'),
        [],
      ],
      [
        'a skip outside a test file',
        { file: 'src/mod.py', code: 'import pytest\n\npytest.skip()\n' },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('sleep-in-test', () => {
  it('flags waiting for real time in a test', () => {
    const [actual, expected] = outcomes([
      [
        'time.sleep',
        inTests('import time\n\n\ndef test_a():\n    time.sleep(1)\n'),
        ['sleep-in-test:5 time.sleep'],
      ],
      [
        'a from import',
        inTests('from time import sleep\n\n\ndef test_a():\n    sleep(0.5)\n'),
        ['sleep-in-test:5 time.sleep'],
      ],
      [
        'asyncio.sleep',
        inTests('import asyncio\n\n\nasync def test_a():\n    await asyncio.sleep(1)\n'),
        ['sleep-in-test:5 asyncio.sleep'],
      ],
      [
        'asyncio.sleep(0) yields to the loop',
        inTests('import asyncio\n\n\nasync def test_a():\n    await asyncio.sleep(0)\n'),
        [],
      ],
      [
        'a patched sleep',
        inTests(
          'import time\n\n\ndef test_a(monkeypatch):\n    monkeypatch.setattr(time, "sleep", print)\n    time.sleep(1)\n',
        ),
        [],
      ],
      [
        'a frozen clock',
        inTests(
          'import time\nfrom freezegun import freeze_time\n\n\n@freeze_time("2026-01-01")\ndef test_a():\n    time.sleep(1)\n',
        ),
        [],
      ],
      ['production code', { file: 'src/mod.py', code: 'import time\n\ntime.sleep(1)\n' }, []],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('tautological-assert', () => {
  it('flags assertions that cannot fail', () => {
    const [actual, expected] = outcomes([
      [
        'assert True',
        inTests('def test_a():\n    assert True\n'),
        ['tautological-assert:2 assert'],
      ],
      ['assert 1', inTests('def test_a():\n    assert 1\n'), ['tautological-assert:2 assert']],
      [
        'assert not False',
        inTests('def test_a():\n    assert not False\n'),
        ['tautological-assert:2 assert'],
      ],
      [
        'equal literals',
        inTests('def test_a():\n    assert 1 == 1\n'),
        ['tautological-assert:2 assert'],
      ],
      [
        'literal ordering',
        inTests('def test_a():\n    assert 1 < 2\n'),
        ['tautological-assert:2 assert'],
      ],
      [
        'a name compared to itself',
        inTests('def test_a(x):\n    assert x == x\n'),
        ['tautological-assert:2 assert'],
      ],
      [
        'an attribute compared to itself',
        inTests('def test_a(x):\n    assert x.a is x.a\n'),
        ['tautological-assert:2 assert'],
      ],
      [
        'an or with a true side',
        inTests('def test_a(x):\n    assert x or True\n'),
        ['tautological-assert:2 assert'],
      ],
      [
        'assertTrue(True)',
        inTests(
          'import unittest\n\n\nclass T(unittest.TestCase):\n    def test_a(self):\n        self.assertTrue(True)\n',
        ),
        ['tautological-assert:6 assertTrue'],
      ],
      [
        'assertEqual of a value and itself',
        inTests(
          'import unittest\n\n\nclass T(unittest.TestCase):\n    def test_a(self):\n        self.assertEqual(self.x, self.x)\n',
        ),
        ['tautological-assert:6 assertEqual'],
      ],
      ['a result compared to a value', inTests('def test_a():\n    assert total() == 3\n'), []],
      [
        'a call compared to itself',
        inTests('def test_a():\n    assert next_id() == next_id()\n'),
        [],
      ],
      ['different literals', inTests('def test_a():\n    assert 1 == 2\n'), []],
      ['an unequal pair of names', inTests('def test_a(x, y):\n    assert x == y\n'), []],
      ['assert False is not a tautology', inTests('def test_a():\n    assert False\n'), []],
      [
        'assertEqual of different values',
        inTests(
          'import unittest\n\n\nclass T(unittest.TestCase):\n    def test_a(self):\n        self.assertEqual(self.x, 3)\n',
        ),
        [],
      ],
      ['production code', { file: 'src/mod.py', code: 'assert True\n' }, []],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('real clock, randomness and network in unit tests', () => {
  it('flags the real clock', () => {
    const [actual, expected] = outcomes([
      [
        'datetime.now',
        inTests(
          'from datetime import datetime\n\n\ndef test_a():\n    assert datetime.now().year\n',
        ),
        ['real-clock-in-test:5 datetime.datetime.now'],
      ],
      [
        'time.time',
        inTests('import time\n\n\ndef test_a():\n    assert time.time()\n'),
        ['real-clock-in-test:5 time.time'],
      ],
      [
        'date.today',
        inTests('from datetime import date\n\n\ndef test_a():\n    assert date.today()\n'),
        ['real-clock-in-test:5 datetime.date.today'],
      ],
      [
        'a fixed datetime',
        inTests(
          'from datetime import datetime\n\n\ndef test_a():\n    assert datetime(2026, 1, 1).year\n',
        ),
        [],
      ],
      [
        'freezegun',
        inTests(
          'from datetime import datetime\nfrom freezegun import freeze_time\n\n\n@freeze_time("2026-01-01")\ndef test_a():\n    assert datetime.now().year\n',
        ),
        [],
      ],
      [
        'time_machine',
        inTests(
          'import time_machine\nfrom datetime import datetime\n\n\n@time_machine.travel("2026-01-01")\ndef test_a():\n    assert datetime.now().year\n',
        ),
        [],
      ],
      [
        'a patched clock',
        inTests(
          'import time\n\n\ndef test_a(monkeypatch):\n    monkeypatch.setattr("time.time", lambda: 1.0)\n    assert time.time()\n',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('flags unseeded randomness', () => {
    const [actual, expected] = outcomes([
      [
        'random.random',
        inTests('import random\n\n\ndef test_a():\n    assert random.random() < 1\n'),
        ['random-in-test:5 random.random'],
      ],
      [
        'random.choice',
        inTests('from random import choice\n\n\ndef test_a():\n    assert choice([1])\n'),
        ['random-in-test:5 random.choice'],
      ],
      [
        'os.urandom',
        inTests('import os\n\n\ndef test_a():\n    assert os.urandom(4)\n'),
        ['random-in-test:5 os.urandom'],
      ],
      [
        'a seeded generator',
        inTests(
          'import random\n\n\ndef test_a():\n    rng = random.Random(42)\n    assert rng.random() < 1\n',
        ),
        [],
      ],
      [
        'random.seed',
        inTests(
          'import random\n\n\ndef test_a():\n    random.seed(42)\n    assert random.random() < 1\n',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('flags the network in a unit test, not in an integration test', () => {
    const [actual, expected] = outcomes([
      [
        'requests.get',
        inTests('import requests\n\n\ndef test_a():\n    assert requests.get("http://x")\n'),
        ['network-in-test:5 requests.get'],
      ],
      [
        'httpx.post',
        inTests('import httpx\n\n\ndef test_a():\n    assert httpx.post("http://x")\n'),
        ['network-in-test:5 httpx.post'],
      ],
      [
        'urlopen',
        inTests(
          'from urllib.request import urlopen\n\n\ndef test_a():\n    assert urlopen("http://x")\n',
        ),
        ['network-in-test:5 urllib.request.urlopen'],
      ],
      [
        'a socket',
        inTests(
          'import socket\n\n\ndef test_a():\n    assert socket.create_connection(("x", 80))\n',
        ),
        ['network-in-test:5 socket.create_connection'],
      ],
      [
        'the responses library',
        inTests(
          'import requests\nimport responses\n\n\n@responses.activate\ndef test_a():\n    assert requests.get("http://x")\n',
        ),
        [],
      ],
      [
        'a patched client',
        inTests(
          'import requests\n\n\ndef test_a(monkeypatch):\n    monkeypatch.setattr("requests.get", print)\n    assert requests.get("http://x")\n',
        ),
        [],
      ],
      [
        'an integration folder',
        inTests(
          'import requests\n\n\ndef test_a():\n    assert requests.get("http://x")\n',
          'tests/integration/test_a.py',
        ),
        [],
      ],
      [
        'an e2e folder',
        inTests(
          'import requests\n\n\ndef test_a():\n    assert requests.get("http://x")\n',
          'tests/e2e/test_a.py',
        ),
        [],
      ],
      [
        'production code',
        { file: 'src/mod.py', code: 'import requests\n\nrequests.get("http://x")\n' },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
