import { useRuleScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useRuleScripts('wall-clock-elapsed', {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('wall-clock-elapsed', () => {
  itOutcomes('flags elapsed time measured with the wall clock', [
    [
      'only the start is reported when the end is kept in a local',
      'import time\n\n\ndef run(task, limit):\n    start = time.time()\n    task()\n ' +
        '   now = time.time()\n    if now - start > limit:\n        print("slow")\n',
      ['wall-clock-elapsed:5 start'],
    ],
    [
      'a timeout loop',
      'import time\n\n\ndef wait(done, timeout):\n    start_time = time.time()\n    ' +
        'while not done():\n        if time.time() - start_time > timeout:\n           ' +
        ' raise TimeoutError\n',
      ['wall-clock-elapsed:5 start_time'],
    ],
    [
      'a difference kept in a local and compared',
      'import time\n\n\ndef run(task, limit):\n    start = time.time()\n    task()\n ' +
        '   elapsed = time.time() - start\n    if elapsed > limit:\n        ' +
        'print("slow")\n',
      ['wall-clock-elapsed:5 start'],
    ],
    [
      'a duration recorded as a metric',
      'import time\n\n\ndef run(task, metrics):\n    start = time.time()\n    ' +
        'task()\n    metrics.observe(time.time() - start)\n',
      ['wall-clock-elapsed:5 start'],
    ],
    [
      'datetime.now',
      'from datetime import datetime\n\n\ndef run(task, limit):\n    start = ' +
        'datetime.now()\n    task()\n    if datetime.now() - start > limit:\n        ' +
        'print("slow")\n',
      ['wall-clock-elapsed:5 start'],
    ],
  ]);

  itOutcomes('leaves the monotonic clock and business times', [
    [
      'monotonic',
      'import time\n\n\ndef wait(done, timeout):\n    start = time.monotonic()\n    ' +
        'while not done():\n        if time.monotonic() - start > timeout:\n           ' +
        ' raise TimeoutError\n',
      [],
    ],
    [
      'a start time that is stored',
      'import time\n\n\ndef run(task, store, limit):\n    start = time.time()\n    ' +
        'store.save(start)\n    if time.time() - start > limit:\n        ' +
        'print("slow")\n',
      [],
    ],
    [
      'an elapsed time that is only logged',
      'import time\n\n\ndef run(task, log):\n    start = time.time()\n    task()\n    log.info(time.time() - start)\n',
      [],
    ],
    [
      'a difference with a stored timestamp',
      'import time\n\n\ndef age(row, limit):\n    now = time.time()\n    return now - row.created_at > limit\n',
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_mod.py',
        code: 'import time\n\n\ndef test_it(limit):\n    start = time.time()\n    assert time.time() - start < limit\n',
      },
      [],
    ],
  ]);
});
