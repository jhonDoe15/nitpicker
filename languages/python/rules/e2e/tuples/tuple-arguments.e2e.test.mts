import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
  hidden: ['test-without-assertion', 'swallowed-exception', 'subprocess-without-timeout'],
});

describeRules('parenthesised-tuple-argument', () => {
  itOutcomes('flags a parenthesised single value where a tuple of arguments is expected', [
    [
      'the args keyword of a task call',
      'def enqueue(task, delay):\n    task.send_with_options(args=(task.pk), delay=delay)\n',
      ['parenthesised-tuple-argument:2 args=(task.pk)'],
    ],
    [
      'the second argument of execute and executemany',
      'def run(cursor, config, rows):\n    cursor.execute(QUERY, (config.get("schema")))\n    cursor.executemany(QUERY, (rows_id))\n',
      [
        'parenthesised-tuple-argument:2 (config.get("schema"))',
        'parenthesised-tuple-argument:3 (rows_id)',
      ],
    ],
    [
      'the args of a thread and a process, by keyword and by position',
      'import threading\nimport multiprocessing\n\n\ndef start(job, key):\n    threading.Thread(target=job, args=(key))\n    multiprocessing.Process(None, job, "n", (key))\n',
      ['parenthesised-tuple-argument:6 args=(key)', 'parenthesised-tuple-argument:7 (key)'],
    ],
    [
      'apply_async with a single value',
      'def start(pool, job, key):\n    pool.apply_async(job, (key))\n',
      ['parenthesised-tuple-argument:2 (key)'],
    ],
    [
      'the argument tuple of __reduce__',
      'class Failure(Exception):\n    def __init__(self, message):\n        self.message = message\n\n    def __reduce__(self):\n        return (Failure, (self.message))\n',
      ['parenthesised-tuple-argument:6 (self.message)'],
    ],
    [
      'a string and a number and an f-string',
      'def run(cursor, name, size):\n    cursor.execute(QUERY, ("fixed"))\n    cursor.execute(QUERY, (size + 1))\n    cursor.execute(QUERY, (f"{name}%"))\n',
      ['parenthesised-tuple-argument:2 ("fixed")', 'parenthesised-tuple-argument:4 (f"{name}%")'],
    ],
    [
      'a value split over lines',
      'def run(cursor, value):\n    cursor.execute(\n        QUERY,\n        (\n            value\n        ),\n    )\n',
      ['parenthesised-tuple-argument:5 ( value )'],
    ],
  ]);

  itOutcomes('leaves tuples, lists, names that hold tuples and other calls alone', [
    [
      'the params and vars keywords, which accept dicts and strings',
      'def run(cursor, value, render):\n    cursor.execute(QUERY, params=(value))\n    render(vars=(value))\n',
      [],
    ],
    [
      'a name bound from fetchone or a tuple-returning function, and a tuple display',
      'def pair() -> tuple[int, int]:\n    return 1, 2\n\n\ndef run(cursor):\n    row = cursor.fetchone()\n    both = pair()\n    cursor.execute(QUERY, (row))\n    cursor.execute(QUERY, (both))\n    cursor.execute(QUERY, (pair()))\n    cursor.execute(QUERY, (cursor.fetchone()))\n',
      [],
    ],
    [
      'a one-element tuple and a tuple of two',
      'def run(cursor, a, b, task):\n    cursor.execute(QUERY, (a,))\n    cursor.execute(QUERY, (a, b))\n    task.send_with_options(args=(a,), delay=1)\n    task.send_with_options(args=((a, b)))\n',
      [],
    ],
    [
      'a list, a generator and a call that builds a tuple',
      'def run(cursor, a, rows):\n    cursor.execute(QUERY, ([a]))\n    cursor.execute(QUERY, (tuple(rows)))\n    cursor.execute(QUERY, (x for x in rows))\n    cursor.execute(QUERY, (None))\n',
      [],
    ],
    [
      'a name that holds a tuple, a plural name and an annotated parameter',
      'def run(cursor, values, params: tuple[int, ...], other: list[int]):\n    pair = (1, 2)\n    cursor.execute(QUERY, (pair))\n    cursor.execute(QUERY, (values))\n    cursor.execute(QUERY, (params))\n    cursor.execute(QUERY, (other))\n',
      [],
    ],
    [
      'an unparenthesised value and a first argument in parentheses',
      'def run(cursor, a):\n    cursor.execute(QUERY, a)\n    cursor.execute((QUERY), a)\n    cursor.execute(QUERY)\n',
      [],
    ],
    [
      'a subprocess args keyword, an unrelated call and an unrelated keyword',
      'import subprocess\n\n\ndef run(cmd, a):\n    subprocess.run(args=(cmd))\n    print(("x"))\n    send(label=(a))\n    send(a, (a))\n',
      [],
    ],
    [
      'a reduce that returns a tuple and a function not named reduce',
      'class Failure(Exception):\n    def __reduce__(self):\n        return (Failure, (self.message,))\n\n    def other(self):\n        return (Failure, (self.message))\n',
      [],
    ],
    [
      'a test file',
      inFile('tests/test_mod.py', 'def run(cursor, a):\n    cursor.execute(QUERY, (a))\n'),
      [],
    ],
  ]);
});

describeRules('message-tuple-argument', () => {
  itOutcomes('flags a tuple used as a log or exception message', [
    [
      'a tuple passed to a logger',
      'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef run(item, user):\n    logger.info(("Processing %s for %s", item, user))\n',
      ["message-tuple-argument:7 ('Processing %s for %s', item, user)"],
    ],
    [
      'a message tuple kept in a name and then logged or raised',
      'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef run(item):\n    message = ("Processing {} now", item)\n    logger.warning(message)\n    raise ValueError(message)\n',
      ['message-tuple-argument:8 message', 'message-tuple-argument:9 message'],
    ],
    [
      'a tuple passed to an exception and a stray trailing comma',
      'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef run(item):\n    text = "Processing %s" % item,\n    logger.error(text)\n    raise RuntimeError(("failed %d", item))\n',
      ["message-tuple-argument:9 ('failed %d', item)"],
    ],
    [
      'the message of logger.log after the level',
      'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef run(item):\n    logger.log(logging.INFO, ("Done %s", item))\n',
      ["message-tuple-argument:7 ('Done %s', item)"],
    ],
  ]);

  itOutcomes('leaves separate arguments, tuples without a format and other calls alone', [
    [
      'the format and its values as separate arguments',
      'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef run(item, user):\n    logger.info("Processing %s for %s", item, user)\n    raise ValueError("Processing %s" % (item,))\n',
      [],
    ],
    [
      'a tuple without a placeholder text and a tuple of plain values',
      'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef run(item):\n    logger.info(("a", "b"))\n    raise KeyError((item, 1))\n',
      [],
    ],
    [
      'a tuple passed to a call that is not a logger or an exception',
      'def run(item, table):\n    table.add(("Row %s", item))\n    return ("Row %s", item)\n',
      [],
    ],
    [
      'a tuple name that is bound twice',
      'import logging\n\nlogger = logging.getLogger(__name__)\n\n\ndef run(item):\n    message = ("Row %s", item)\n    message = message[0] % item\n    logger.info(message)\n',
      [],
    ],
  ]);
});
