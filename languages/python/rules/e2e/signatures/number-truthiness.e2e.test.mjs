import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['boolean-flag-parameter'] });
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });

describe.skipIf(!enabled)('number-truthiness', () => {
  it('flags a number-annotated name that a condition tests for truth', () => {
    const [actual, expected] = outcomes([
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
    expect(actual).toEqual(expected);
  });

  it('leaves comparisons, other types and unknown types alone', () => {
    const [actual, expected] = outcomes([
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
      ['a len call', 'def run(rows: list[int]) -> int:\n    return 1 if len(rows) else 2\n', []],
    ]);
    expect(actual).toEqual(expected);
  });
});
