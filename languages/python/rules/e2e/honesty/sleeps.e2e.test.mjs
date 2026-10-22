import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf, single } = createScripts();
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
    [
      'a while True loop that never reads the clock',
      'import time\nwhile True:\n    if ready():\n        break\n    time.sleep(0.1)\n',
      ['sleep-in-test tests/test_mod.py:5 time.sleep'],
    ],
    [
      'a while True loop with a deadline',
      'import time\nend = time.monotonic() + 5\nwhile True:\n    if ready() or time.monotonic() > end:\n        break\n    time.sleep(0.1)\n',
      [],
    ],
    [
      'a while 1 loop that checks the event loop clock',
      'import asyncio\nasync def test_a():\n    loop = asyncio.get_running_loop()\n    end = loop.time() + 5\n    while 1:\n        if ready() or loop.time() > end:\n            return\n        await asyncio.sleep(0.1)\n',
      [],
    ],
    [
      'a thread target defined in the test',
      'import threading, time\ndef test_a():\n    def slow():\n        time.sleep(1)\n    threading.Thread(target=slow).start()\n',
      [],
    ],
    [
      'a lambda handed to an executor',
      'import time\ndef test_a(pool):\n    pool.submit(lambda: time.sleep(1))\n',
      [],
    ],
    [
      'a mock side effect',
      'import time\nfrom unittest import mock\nslow = mock.Mock(side_effect=lambda *a: time.sleep(1))\ndef pause(*a):\n    time.sleep(1)\nother = mock.Mock()\nother.side_effect = pause\n',
      [],
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

  it('follows a production helper that sleeps through a star import', () => {
    expect(
      only('sleep-in-test')(
        findingsOf({
          'shop/__init__.py': '',
          'shop/waits.py': 'from time import *\n\n\ndef pause():\n    sleep(1)\n',
          'tests/test_a.py': 'from shop.waits import pause\n\n\ndef test_a():\n    pause()\n',
        }),
      ),
    ).toEqual(['sleep-in-test tests/test_a.py:5 shop.waits.pause']);
  });
});

describe.skipIf(!enabled)('negative-wait-in-test', () => {
  const waits = (code) => only('negative-wait-in-test')(single(code, TEST_FILE));

  it.each([
    [
      'an event that is not set in time',
      'def test_a(event):\n    assert not event.wait(0.5)\n',
      ['negative-wait-in-test tests/test_mod.py:2 event.wait'],
    ],
    [
      'a lock that is not acquired in time, compared with False',
      'def test_a(lock):\n    assert lock.acquire(timeout=1) is False\n',
      ['negative-wait-in-test tests/test_mod.py:2 lock.acquire'],
    ],
    [
      'assertFalse of a wait',
      'class T:\n    def test_a(self):\n        self.assertFalse(self.done.wait(timeout=2))\n',
      ['negative-wait-in-test tests/test_mod.py:3 self.done.wait'],
    ],
    [
      'pytest.raises around asyncio.wait_for',
      'import asyncio, pytest\nasync def test_a(fut):\n    with pytest.raises(asyncio.TimeoutError):\n        await asyncio.wait_for(fut, 0.1)\n',
      ['negative-wait-in-test tests/test_mod.py:4 asyncio.wait_for'],
    ],
    [
      'assertRaises around a queue read',
      'import queue\nclass T:\n    def test_a(self, q):\n        with self.assertRaises((queue.Empty,)):\n            q.get(timeout=0.5)\n',
      ['negative-wait-in-test tests/test_mod.py:5 q.get'],
    ],
    ['a check of the state', 'def test_a(event):\n    assert not event.is_set()\n', []],
    ['a wait that must succeed', 'def test_a(event):\n    assert event.wait(5)\n', []],
    ['a wait without a delay', 'def test_a(event):\n    assert not event.wait(0)\n', []],
    [
      'pytest.raises of another error',
      'import pytest\ndef test_a(q):\n    with pytest.raises(ValueError):\n        q.get(timeout=1)\n',
      [],
    ],
    [
      'a read that does not wait',
      'import pytest, queue\ndef test_a(q):\n    with pytest.raises(queue.Empty):\n        q.get_nowait()\n',
      [],
    ],
  ])('%s', (_name, code, expected) => {
    expect(waits(code)).toEqual(expected);
  });

  it('does not apply to production code', () => {
    expect(
      only('negative-wait-in-test')(single('assert not event.wait(1)\n', 'shop/mod.py')),
    ).toEqual([]);
  });
});
