import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, single } = createScripts();
afterEach(cleanup);

const TEST_FILE = 'tests/test_mod.py';
const only = (rule) => (findings) => findings.filter((finding) => finding.startsWith(`${rule} `));

describe.skipIf(!enabled)('sleep-in-test', () => {
  const sleeps = (code, file = TEST_FILE) => only('sleep-in-test')(single(code, file));

  it.each([
    [
      'time.sleep',
      'import time\ntime.sleep(1)\n',
      ['sleep-in-test tests/test_mod.py:2 time.sleep'],
    ],
    [
      'an imported sleep',
      'from time import sleep\nsleep(0.5)\n',
      ['sleep-in-test tests/test_mod.py:2 time.sleep'],
    ],
    [
      'an awaited asyncio.sleep',
      'import asyncio\nasync def test_a():\n    await asyncio.sleep(0.1)\n',
      ['sleep-in-test tests/test_mod.py:3 asyncio.sleep'],
    ],
    [
      'a delay passed by keyword',
      'import trio\ntrio.sleep(seconds=2)\n',
      ['sleep-in-test tests/test_mod.py:2 trio.sleep'],
    ],
    [
      'Playwright wait_for_timeout, also in a loop',
      'def test_a(page):\n    for _ in range(3):\n        page.wait_for_timeout(500)\n',
      ['sleep-in-test tests/test_mod.py:3 page.wait_for_timeout'],
    ],
    ['a zero sleep that only yields', 'import asyncio\nasyncio.sleep(0)\n', []],
    ['a sleep inside a polling loop', 'import time\nwhile not done():\n    time.sleep(0.05)\n', []],
    ['another sleep function', 'import mylib\nmylib.sleep(1)\n', []],
    [
      'a for loop that only repeats the wait',
      'import time\nfor _ in range(10):\n    time.sleep(1)\n',
      ['sleep-in-test tests/test_mod.py:3 time.sleep'],
    ],
    [
      'a for loop that stops when the condition holds',
      'import time\nfor _ in range(50):\n    if ready():\n        break\n    time.sleep(0.1)\n',
      [],
    ],
    [
      'a retry loop that returns once the call succeeds',
      'import time\ndef test_a():\n    for _ in range(5):\n        try:\n            return call()\n        except OSError:\n            time.sleep(1)\n',
      [],
    ],
    [
      'a for loop whose only break belongs to an inner loop',
      'import time\nfor _ in range(3):\n    for item in items:\n        if item:\n            break\n    time.sleep(1)\n',
      ['sleep-in-test tests/test_mod.py:6 time.sleep'],
    ],
    [
      'an unconditional break',
      'import time\nfor _ in range(3):\n    time.sleep(1)\n    break\n',
      ['sleep-in-test tests/test_mod.py:3 time.sleep'],
    ],
    [
      'the else branch of a while loop',
      'import time\nwhile ready():\n    pass\nelse:\n    time.sleep(1)\n',
      ['sleep-in-test tests/test_mod.py:5 time.sleep'],
    ],
    [
      'a comprehension',
      'import time\n[time.sleep(1) for _ in range(3)]\n',
      ['sleep-in-test tests/test_mod.py:2 time.sleep'],
    ],
    [
      'a sleep from a star import',
      'from time import *\nsleep(5)\n',
      ['sleep-in-test tests/test_mod.py:2 time.sleep'],
    ],
    [
      'a helper that sleeps',
      'import time\ndef pause(seconds):\n    time.sleep(seconds)\n',
      ['sleep-in-test tests/test_mod.py:3 time.sleep'],
    ],
  ])('%s', (_name, code, expected) => {
    expect(sleeps(code)).toEqual(expected);
  });

  it.each([
    ['a with block that patches it', 'with mock.patch("time.sleep"):\n        time.sleep(5)'],
    [
      'a with block that patches the module attribute',
      'with mock.patch.object(time, "sleep"):\n        time.sleep(5)',
    ],
  ])('does not report a sleep under %s', (_name, body) => {
    const code = `import time\nfrom unittest import mock\ndef test_a():\n    ${body}\n`;
    expect(sleeps(code)).toEqual([]);
  });

  it('does not report a sleep in a test the patch decorates', () => {
    const code =
      'import time\nfrom unittest.mock import patch\n@patch("time.sleep")\ndef test_a(sleep):\n    time.sleep(5)\n';
    expect(sleeps(code)).toEqual([]);
  });

  it('does not report a sleep in a method of a class the patch decorates', () => {
    const code =
      'import time\nfrom unittest.mock import patch\n@patch("time.sleep")\nclass TestA:\n    def test_a(self, sleep):\n        time.sleep(5)\n';
    expect(sleeps(code)).toEqual([]);
  });

  it('reports a sleep after the patch ends', () => {
    const code = [
      'import time',
      'from unittest import mock',
      'def test_a():',
      '    with mock.patch("time.sleep"):',
      '        time.sleep(5)',
      '    time.sleep(1)',
      '',
    ].join('\n');
    expect(sleeps(code)).toEqual(['sleep-in-test tests/test_mod.py:6 time.sleep']);
  });

  it('checks the code of a function defined in a loop as its own scope', () => {
    expect(sleeps('import time\nfor _ in x:\n    def f():\n        time.sleep(1)\n')).toEqual([
      'sleep-in-test tests/test_mod.py:4 time.sleep',
    ]);
  });

  it.each(['src/conftest.py', 'test/helpers.py', 'src/test_a.py', 'testing/helpers.py'])(
    'applies to %s',
    (file) => {
      expect(sleeps('import time\ntime.sleep(1)\n', file)).toHaveLength(1);
    },
  );

  it.each(['src/mod.py', 'shop/testing/helpers.py', 'shop/tests.py'])(
    'does not apply to %s',
    (file) => {
      expect(sleeps('import time\ntime.sleep(1)\n', file)).toEqual([]);
    },
  );
});
