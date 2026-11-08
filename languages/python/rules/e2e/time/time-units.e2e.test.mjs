import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const RULE = 'time-unit-mismatch';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(RULE))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('time-unit-mismatch', () => {
  it('reports seconds and milliseconds mixed in arithmetic and comparisons', () => {
    const [actual, expected] = outcomes([
      [
        'a JWT claim against time.time() in milliseconds, and names of two units',
        'import time\n\n\ndef expired(payload, ttl_seconds, started_ms):\n    late = payload["exp"] < time.time() * 1000\n    deadline = started_ms + ttl_seconds\n    return late or time.monotonic() > deadline\n',
        [`${RULE}:5 payload["exp"] < time.time() * 1000`, `${RULE}:6 started_ms + ttl_seconds`],
      ],
      [
        'a local value carries the unit of the clock it came from',
        'import time\n\n\ndef stale(realm):\n    now = time.time_ns()\n    return now - realm.max_delta_time_seconds\n',
        [`${RULE}:6 now - realm.max_delta_time_seconds`],
      ],
      [
        'explicit conversions, one unit, and plain numbers pass',
        'import time\n\nMS_PER_SECOND = 1000\n\n\ndef ok(payload, ttl_seconds, started_ms, retries):\n    late = payload.get("exp") < time.time()\n    deadline = started_ms + ttl_seconds * MS_PER_SECOND\n    budget_ms = int(time.monotonic() * 1000) + started_ms\n    return late, deadline, budget_ms, retries + 1\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports values assigned or passed under the name of another unit', () => {
    const [actual, expected] = outcomes([
      [
        'names, keywords, dictionaries and same-module parameters',
        'import time\nfrom datetime import timedelta\n\n\ndef retry(delay_ms):\n    return delay_ms\n\n\nclass Lock:\n    def __init__(self, wait_seconds):\n        self.lock_wait_timeout_millis = wait_seconds\n\n\ndef build(ttl_ms, pause_ms, backoff_seconds):\n    options = {"timeout_seconds": ttl_ms}\n    time.sleep(pause_ms)\n    retry(backoff_seconds)\n    return options, timedelta(seconds=ttl_ms)\n',
        [
          `${RULE}:11 wait_seconds`,
          `${RULE}:15 ttl_ms`,
          `${RULE}:16 pause_ms`,
          `${RULE}:17 backoff_seconds`,
          `${RULE}:18 ttl_ms`,
        ],
      ],
      [
        'converted values and matching names pass',
        'import time\nfrom datetime import timedelta\n\n\ndef retry(delay_ms):\n    return delay_ms\n\n\ndef build(ttl_ms, pause_ms, backoff_seconds):\n    options = {"timeout_seconds": ttl_ms / 1000}\n    time.sleep(pause_ms / 1000)\n    retry(backoff_seconds * 1000)\n    return options, timedelta(milliseconds=ttl_ms)\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports epoch times narrowed to 32 bits', () => {
    const [actual, expected] = outcomes([
      [
        'numpy and ctypes 32-bit integers',
        'import ctypes\nimport time\n\nimport numpy as np\n\n\ndef stamp():\n    return np.int32(time.time()), ctypes.c_int32(int(time.time() * 1000))\n',
        [`${RULE}:8 ctypes.c_int32(int(time.time() * 1000))`, `${RULE}:8 np.int32(time.time())`],
      ],
      [
        'a duration in a 32-bit integer passes',
        'import time\n\nimport numpy as np\n\n\ndef elapsed(started):\n    return np.int32(time.monotonic() - started), np.int64(time.time())\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves tests alone', () => {
    const [actual, expected] = outcomes([
      [
        'a test file',
        {
          file: 'tests/test_expiry.py',
          code: 'import time\n\n\ndef test_expired():\n    assert {"exp": 1}["exp"] < time.time() * 1000\n',
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
