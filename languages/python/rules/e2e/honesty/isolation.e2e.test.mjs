import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts({
  hidden: ['test-without-assertion', 'weak-assertion'],
});
afterEach(cleanup);

const inTests = (code, file = 'tests/test_a.py') => ({ file, code });
const SLEEP = 'import time\n\n\ndef test_a():\n    time.sleep(1)\n';
const CLOCK = 'import datetime\n\n\ndef test_a():\n    assert datetime.datetime.now()\n';
const NETWORK = 'import requests\n\n\ndef test_a():\n    assert requests.get("http://x")\n';

describe.skipIf(!enabled)('a fake that is only named, not applied', () => {
  it('does not hide the real clock, sleep or network', () => {
    const [actual, expected] = outcomes([
      [
        'a docstring that names freezegun',
        inTests(`"""Uses freezegun."""\n${SLEEP}`),
        ['sleep-in-test:6 time.sleep'],
      ],
      [
        'a variable named responses',
        inTests(`responses = []\n${NETWORK}`),
        ['network-in-test:6 requests.get'],
      ],
      [
        'an import that is never used',
        inTests(`import freezegun\n${CLOCK}`),
        ['real-clock-in-test:6 datetime.datetime.now'],
      ],
      [
        'a comment that names the fake',
        inTests(`# patch(time.sleep)\n${SLEEP}`),
        ['sleep-in-test:6 time.sleep'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('keeps an unrelated edit of a legacy file from creating findings', () => {
    const before = inTests(`# responses are stubbed elsewhere\n${NETWORK}`);
    const after = inTests(NETWORK);
    const [actual] = outcomes([
      ['before', before, []],
      ['after', after, []],
    ]);

    expect(actual.before).toEqual(['network-in-test:6 requests.get']);
    expect(actual.after).toEqual(['network-in-test:5 requests.get']);
  });
});

describe.skipIf(!enabled)('a fake applied to one test', () => {
  const twoTests = (first, second) =>
    inTests(
      `import time\nimport pytest\nfrom freezegun import freeze_time\n\n${first}\n\n${second}\n`,
    );
  const faked = '@freeze_time("2024-01-01")\ndef test_faked():\n    time.sleep(1)';
  const plain = 'def test_plain():\n    time.sleep(1)';

  it('leaves the other tests of the file flagged', () => {
    const [actual, expected] = outcomes([
      ['faked first', twoTests(faked, plain), ['sleep-in-test:10 time.sleep']],
      ['faked second', twoTests(plain, faked), ['sleep-in-test:6 time.sleep']],
    ]);

    expect(actual).toEqual(expected);
  });

  it.each([
    ['a decorator', '@freeze_time("2024-01-01")\ndef test_a():\n    time.sleep(1)'],
    ['a fixture parameter', 'def test_a(freezer):\n    time.sleep(1)'],
    ['a with block', 'def test_a():\n    with freeze_time("2024-01-01"):\n        time.sleep(1)'],
    [
      'a monkeypatch of sleep',
      'def test_a(monkeypatch):\n    monkeypatch.setattr(time, "sleep", lambda s: None)\n    time.sleep(1)',
    ],
    [
      'a monkeypatch of sleep by name',
      'def test_a(monkeypatch):\n    monkeypatch.setattr("time.sleep", lambda s: None)\n    time.sleep(1)',
    ],
    ['a mocker patch', 'def test_a(mocker):\n    mocker.patch("time.sleep")\n    time.sleep(1)'],
    [
      'a patch decorator',
      'from unittest.mock import patch\n\n\n@patch("time.sleep")\ndef test_a(sleep):\n    time.sleep(1)',
    ],
    ['a usefixtures mark', '@pytest.mark.usefixtures("freezer")\ndef test_a():\n    time.sleep(1)'],
    [
      'a fixture of the module that freezes time',
      '@pytest.fixture\ndef frozen():\n    with freeze_time("2024-01-01"):\n        yield\n\n\ndef test_a(frozen):\n    time.sleep(1)',
    ],
    [
      'an autouse fixture of the module',
      '@pytest.fixture(autouse=True)\ndef frozen():\n    with freeze_time("2024-01-01"):\n        yield\n\n\ndef test_a():\n    time.sleep(1)',
    ],
    [
      'the module mark',
      'pytestmark = pytest.mark.usefixtures("freezer")\n\n\ndef test_a():\n    time.sleep(1)',
    ],
    [
      'a class setUp that patches',
      'import unittest\nfrom unittest import mock\n\n\nclass T(unittest.TestCase):\n    def setUp(self):\n        mock.patch("time.sleep").start()\n\n    def test_a(self):\n        time.sleep(1)',
    ],
  ])('is not flagged under %s', (_name, body) => {
    const code = `import time\nimport pytest\nfrom freezegun import freeze_time\n\n${body}\n`;
    const [actual] = outcomes([['case', inTests(code), []]]);

    expect(actual.case).toEqual([]);
  });

  it('stops at the with block', () => {
    const code =
      'import time\nfrom freezegun import freeze_time\n\n\ndef test_a():\n    with freeze_time("2024-01-01"):\n        pass\n    time.sleep(1)\n';
    const [actual] = outcomes([['case', inTests(code), []]]);

    expect(actual.case).toEqual(['sleep-in-test:8 time.sleep']);
  });

  it('follows an autouse fixture of the conftest to the tests beneath it', () => {
    const conftest =
      'import pytest\nfrom freezegun import freeze_time\n\n\n@pytest.fixture(autouse=True)\ndef frozen():\n    with freeze_time("2024-01-01"):\n        yield\n';

    expect(
      findingsOf({
        'tests/conftest.py': conftest,
        'tests/test_a.py': SLEEP,
        'other/test_b.py': SLEEP,
      }),
    ).toEqual(['sleep-in-test other/test_b.py:5 time.sleep']);
  });

  it.each([
    [
      'the clock',
      CLOCK,
      'import datetime\nfrom freezegun import freeze_time\n\n\n@freeze_time("2024-01-01")\ndef test_a():\n    assert datetime.datetime.now()\n',
    ],
    [
      'the network',
      NETWORK,
      'import requests\nimport responses\n\n\n@responses.activate\ndef test_a():\n    assert requests.get("http://x")\n',
    ],
  ])('flags %s without it and passes with it', (_name, bare, fakedCode) => {
    const [actual] = outcomes([
      ['bare', inTests(bare), []],
      ['faked', inTests(fakedCode), []],
    ]);

    expect(actual.bare).toHaveLength(1);
    expect(actual.faked).toEqual([]);
  });
});

describe.skipIf(!enabled)('the forms that reach the real clock, sleep or randomness', () => {
  it('are found through aliases and helpers', () => {
    const [actual, expected] = outcomes([
      [
        'an alias of sleep',
        inTests('import time\n\nnap = time.sleep\n\n\ndef test_a():\n    nap(0.01)\n'),
        ['sleep-in-test:7 time.sleep'],
      ],
      [
        'a from import alias of the clock',
        inTests('from datetime import datetime as dt\n\n\ndef test_a():\n    assert dt.now()\n'),
        ['real-clock-in-test:5 datetime.datetime.now'],
      ],
      [
        'an unseeded Random instance',
        inTests('import random\n\n\ndef test_a():\n    assert random.Random().randint(1, 6)\n'),
        ['random-in-test:5 random.Random'],
      ],
      [
        'a seeded Random instance',
        inTests('import random\n\n\ndef test_a():\n    assert random.Random(7).randint(1, 6)\n'),
        [],
      ],
      [
        'the seed of the module generator',
        inTests(
          'import random\n\n\ndef test_a():\n    random.seed(1)\n    assert random.randint(1, 6)\n',
        ),
        [],
      ],
      [
        'numpy random',
        inTests('import numpy as np\n\n\ndef test_a():\n    assert np.random.rand()\n'),
        ['random-in-test:5 numpy.random.rand'],
      ],
      [
        'an unseeded numpy generator',
        inTests(
          'import numpy as np\n\n\ndef test_a():\n    assert np.random.default_rng().random()\n',
        ),
        ['random-in-test:5 numpy.random.default_rng'],
      ],
      [
        'a seeded numpy generator',
        inTests(
          'import numpy as np\n\n\ndef test_a():\n    assert np.random.default_rng(3).random()\n',
        ),
        [],
      ],
      [
        'uuid4',
        inTests('import uuid\n\n\ndef test_a():\n    assert uuid.uuid4()\n'),
        ['random-in-test:5 uuid.uuid4'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('are found in a helper of the source that sleeps', () => {
    const files = {
      'src/shop/waits.py': 'import time\n\n\ndef pause():\n    time.sleep(1)\n',
      'tests/test_a.py':
        'from shop import waits\nfrom shop.waits import pause\n\n\ndef test_a():\n    waits.pause()\n    pause()\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'sleep-in-test tests/test_a.py:6 shop.waits.pause',
      'sleep-in-test tests/test_a.py:7 shop.waits.pause',
    ]);
  });
});

describe.skipIf(!enabled)('tautologies', () => {
  it('flags the always-true forms agents write', () => {
    const [actual, expected] = outcomes([
      [
        'len at least zero',
        inTests('def test_a(items):\n    assert len(items) >= 0\n'),
        ['tautological-assert:2 assert'],
      ],
      [
        'zero at most len',
        inTests('def test_a(items):\n    assert 0 <= len(items)\n'),
        ['tautological-assert:2 assert'],
      ],
      [
        'isinstance of object',
        inTests('def test_a(items):\n    assert isinstance(items, object)\n'),
        ['tautological-assert:2 assert'],
      ],
      [
        'membership in a list of itself',
        inTests('def test_a(items):\n    assert items in [items]\n'),
        ['tautological-assert:2 assert'],
      ],
      [
        'unittest len at least zero',
        inTests(
          'import unittest\n\n\nclass T(unittest.TestCase):\n    def test_a(self):\n        self.assertGreaterEqual(len([1]), 0)\n',
        ),
        ['tautological-assert:6 assertGreaterEqual'],
      ],
      [
        'unittest assertIn of itself',
        inTests(
          'import unittest\n\n\nclass T(unittest.TestCase):\n    def test_a(self):\n        self.assertIn(1, [1])\n',
        ),
        ['tautological-assert:6 assertIn'],
      ],
      [
        'unittest isinstance of object',
        inTests(
          'import unittest\n\n\nclass T(unittest.TestCase):\n    def test_a(self):\n        self.assertIsInstance(1, object)\n',
        ),
        ['tautological-assert:6 assertIsInstance'],
      ],
      ['len greater than zero', inTests('def test_a(items):\n    assert len(items) > 0\n'), []],
      [
        'isinstance of a class',
        inTests('def test_a(items):\n    assert isinstance(items, list)\n'),
        [],
      ],
      [
        'membership in another list',
        inTests('def test_a(items, other):\n    assert items in [other]\n'),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
