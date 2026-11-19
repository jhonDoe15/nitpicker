import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
  hidden: ['boolean-flag-parameter'],
});

describeRules('number-truthiness', () => {
  itOutcomes('flags a number-annotated name that a condition tests for truth', [
    [
      'an if',
      'def run(count: int) -> int:\n    if count:\n        return 1\n    return 2\n',
      ['number-truthiness:2 run(count)'],
    ],
    [
      'a negation of an optional number',
      'def save(record_id: int | None) -> str:\n    if not record_id:\n        return "new"\n    return "saved"\n',
      ['number-truthiness:2 save(record_id)'],
    ],
    [
      'a conditional expression',
      'def header(retry: int) -> str:\n    return f"retry: {retry}" if retry else ""\n',
      ['number-truthiness:2 header(retry)'],
    ],
    [
      'an Optional float in a while',
      'from typing import Optional\n\n\ndef wait(left: Optional[float]) -> None:\n    while left:\n        left -= 1.0\n',
      ['number-truthiness:5 wait(left)'],
    ],
    [
      'an and operand and an or operand in a condition',
      'def run(index: int, flag: bool) -> bool:\n    return bool(index and flag)\n\n\ndef other(index: int, flag: bool) -> int:\n    if flag or index:\n        return 1\n    return 2\n',
      ['number-truthiness:2 run(index)', 'number-truthiness:6 other(index)'],
    ],
    [
      'an or default on a required number',
      'def page(limit: int) -> int:\n    return limit or 10\n',
      ['number-truthiness:2 page(limit)'],
    ],
    [
      'an annotated local, an assert and a comprehension filter',
      'def run(rows: list[int]) -> list[int]:\n    total: int = sum(rows)\n    assert total\n    return [row for row in rows if total]\n',
      ['number-truthiness:3 run(total)'],
    ],
    [
      'a countdown that steps the number',
      'def drain(left: int) -> None:\n    while left:\n        left = left - 1\n',
      ['number-truthiness:2 drain(left)'],
    ],
    [
      'a number field of a class in the module',
      'class Message:\n    retry: int\n    id: int | None\n\n\ndef header(message: Message | None) -> str:\n    return "r" if message.retry else ""\n\n\ndef save(message: Message) -> bool:\n    return not message.id\n',
      ['number-truthiness:7 header(message.retry)', 'number-truthiness:11 save(message.id)'],
    ],
    [
      'a number field read through self',
      'class Pager:\n    size: int\n\n    def empty(self) -> bool:\n        return not self.size\n',
      ['number-truthiness:5 Pager.empty(self.size)'],
    ],
    [
      'a method in a test file',
      inFile(
        'tests/test_mod.py',
        'class Pager:\n    def size(self, limit: int) -> int:\n        return 1 if limit else 2\n',
      ),
      ['number-truthiness:3 Pager.size(limit)'],
    ],
  ]);

  itOutcomes(
    'flags values that come from calls, other modules and types with a falsy empty value',
    [
      [
        'a walrus on a call whose return annotation is a number',
        'def running_state() -> int | None:\n    return 0\n\n\ndef attrs() -> dict[str, int]:\n    found = {}\n    if (state := running_state()):\n        found["state"] = state\n    return found\n',
        ['number-truthiness:7 attrs(state)'],
      ],
      [
        'a local assigned once from a number call',
        'def pick_seed() -> int:\n    return 0\n\n\ndef run() -> int:\n    seed = pick_seed()\n    if seed:\n        return seed\n    return 1\n',
        ['number-truthiness:7 run(seed)'],
      ],
      [
        'a number call tested directly through a method',
        'class Meter:\n    def watts(self) -> float:\n        return 0.0\n\n\ndef show(meter: Meter) -> str:\n    return "on" if meter.watts() else "off"\n',
        ['number-truthiness:7 show(watts())'],
      ],
      [
        'a number field of a class from another module',
        {
          files: {
            'fieldspkg/readings.py': 'class Reading:\n    value: int | None\n    unit: str\n',
            'fieldspkg/show.py':
              'from fieldspkg.readings import Reading\n\n\ndef show(reading: Reading) -> str:\n    return "x" if reading.value else ""\n',
          },
        },
        ['number-truthiness:5 show(reading.value)'],
      ],
      [
        'a timedelta parameter',
        'from datetime import timedelta\n\n\ndef render(age: timedelta) -> str:\n    if not age:\n        return ""\n    return str(age)\n',
        ['number-truthiness:5 render(age)'],
      ],
      [
        'a queryset parameter and an annotated queryset local',
        'from django.db.models import QuerySet\n\n\ndef rows(qs: QuerySet[Row]) -> int:\n    if qs:\n        return 1\n    return 0\n',
        ['number-truthiness:5 rows(qs)'],
      ],
      [
        'a local queryset built from a manager and tested for truth',
        'def pending(user) -> int:\n    qs = Row.objects.filter(owner=user)\n    if not qs:\n        return 0\n    return 1\n',
        ['number-truthiness:3 pending(qs)'],
      ],
      [
        'a number method called on self',
        'class Gauge:\n    def watts(self) -> float:\n        return 0.0\n\n    def label(self) -> str:\n        return "on" if self.watts() else "off"\n',
        ['number-truthiness:6 Gauge.label(watts())'],
      ],
    ],
  );

  itOutcomes('leaves comparisons, other types and unknown types alone', [
    [
      'comparisons and None tests',
      'def run(count: int, record_id: int | None) -> bool:\n    if record_id is None:\n        return False\n    return count > 0 and count != 0\n',
      [],
    ],
    [
      'strings, lists, booleans and unannotated names',
      'def run(name: str, items: list[int], flag: bool, other) -> bool:\n    return bool(name and items and flag and other)\n',
      [],
    ],
    [
      'a bool conversion and the last operand outside a condition',
      'def run(count: int, flag: bool) -> object:\n    first = bool(count)\n    second = flag and count\n    return first, second\n',
      [],
    ],
    ['an or default of zero', 'def run(count: int) -> int:\n    return count or 0\n', []],
    [
      'an optional parameter with an or default, which falsy-default reports',
      'def page(limit: int | None = None) -> int:\n    return limit or 10\n',
      ['falsy-default:2 page(limit)'],
    ],
    [
      'a rebound name',
      'def run(count: int, rows: list[str]) -> int:\n    count = len(rows)\n    return 1 if count else 2\n',
      [],
    ],
    [
      'a nested function with its own parameter',
      'def outer(count: int) -> object:\n    def inner(count):\n        return 1 if count else 2\n    return inner\n',
      [],
    ],
    [
      'names bound again by an import, a def, an except clause and a match capture',
      'def a(n: int) -> int:\n    import os as n\n    return 1 if n else 2\n\n\ndef b(n: int) -> int:\n    def n() -> None:\n        return None\n    return 1 if n else 2\n\n\ndef c(n: int) -> int:\n    try:\n        return 0\n    except ValueError as n:\n        return 1 if n else 2\n\n\ndef d(n: int, o: object) -> int:\n    match o:\n        case [n]:\n            pass\n    return 1 if n else 2\n',
      [],
    ],
    [
      'a field that is not a number and a static method',
      'class Pager:\n    name: str\n    size: int\n\n    def label(self) -> str:\n        return self.name if self.name else "none"\n\n    @staticmethod\n    def check(size) -> bool:\n        return not size\n',
      [],
    ],
    [
      'calls without a number return annotation and builtin method names',
      'def read() -> str:\n    return ""\n\n\ndef get() -> int:\n    return 1\n\n\ndef run(table: dict[str, int]) -> int:\n    if read():\n        return 1\n    return 2 if table.get("a") else 3\n',
      [],
    ],
    [
      'a call result that is compared or rebound',
      'def total() -> int:\n    return 1\n\n\ndef run(flag: bool) -> int:\n    count = total()\n    if count > 0 and (other := total()) is not None:\n        return other\n    count = 2 if flag else 3\n    return 1 if count else 0\n',
      [],
    ],
    [
      'a call name defined twice in the project',
      'def size() -> int:\n    return 1\n\n\nclass Box:\n    def size(self) -> str:\n        return "a"\n\n\ndef run(box: Box) -> int:\n    return 1 if box.size() else 0\n',
      [],
    ],
    [
      'an optional dict or list tested for truth',
      'def load(options: dict[str, int] | None, items: list[int] | None) -> int:\n    if not options:\n        return 1\n    return 2 if items else 3\n',
      [],
    ],
    [
      'a method called on an untyped receiver, and a bare method name',
      'class Probe:\n    def watts(self) -> float:\n        return 0.0\n\n\ndef show(meter, other: Other) -> str:\n    return "on" if meter.watts() or other.watts() else "off"\n',
      [],
    ],
    [
      'manager calls that are not querysets',
      'def run(site, scene):\n    user = User.objects.create_user("a")\n    current = Site.objects.get_current()\n    keys = scene.objects.keys()\n    copy = scene.objects.copy()\n    return 1 if user and current and keys and copy else 0\n',
      [],
    ],
    [
      'a field of a class with the same name as an imported library class',
      {
        files: {
          'responses.py': 'class Response:\n    status: int\n',
          'show.py':
            'import httpx\n\n\ndef show(response: httpx.Response) -> str:\n    return "x" if response.status else ""\n',
        },
      },
      [],
    ],
    [
      'a required dict or list and a queryset exists call',
      'def run(options: dict[str, int], items: list[int], qs) -> int:\n    if options and items and qs.exists():\n        return 1\n    return 0\n',
      [],
    ],
    [
      'a terminal ORM call and an emptiness test with len',
      'def run(user) -> int:\n    row = Row.objects.filter(owner=user).first()\n    rows = list(Row.objects.all())\n    if row and len(rows) > 0:\n        return 1\n    return 0\n',
      [],
    ],
    [
      'a class that exists twice in the project',
      {
        files: {
          'a.py': 'class Sample:\n    value: int\n',
          'b.py': 'class Sample:\n    value: str\n',
          'show.py':
            'from a import Sample\n\n\ndef show(reading: Sample) -> str:\n    return "x" if reading.value else ""\n',
        },
      },
      [],
    ],
    ['a len call', 'def run(rows: list[int]) -> int:\n    return 1 if len(rows) else 2\n', []],
  ]);
});
