import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });

describe.skipIf(!enabled)('boolean-flag-parameter', () => {
  it('flags a positional boolean of a public function that selects a behavior', () => {
    const [actual, expected] = outcomes([
      [
        'an annotated flag in an if',
        'def send(message: str, urgent: bool):\n    if urgent:\n        return message.upper()\n    return message\n',
        ['boolean-flag-parameter:1 send(urgent)'],
      ],
      [
        'a flag with a boolean default',
        'def stop(message, force=False):\n    return message.upper() if force else message\n',
        ['boolean-flag-parameter:1 stop(force)'],
      ],
      [
        'a boolean in a negated condition',
        'def f(a, flag: bool = False):\n    if not flag:\n        return a\n    return 1\n',
        ['boolean-flag-parameter:1 f(flag)'],
      ],
      [
        'a nullable boolean, which is a tri-state rather than a flag',
        'def f(a, flag: bool | None = None):\n    if not flag:\n        return a\n    return 1\n',
        ['tri-state-boolean:1 f(flag)'],
      ],
      [
        'a flag combined with another condition',
        'def f(a, flag: bool):\n    while a and flag:\n        a -= 1\n',
        ['boolean-flag-parameter:1 f(flag)'],
      ],
      [
        'a string annotation',
        'def f(a, flag: "bool"):\n    if flag:\n        return a\n',
        ['boolean-flag-parameter:1 f(flag)'],
      ],
      [
        'a public method of a public class',
        'class Mailer:\n    def deliver(self, flag: bool):\n        if flag:\n            return 1\n',
        ['boolean-flag-parameter:2 Mailer.deliver(flag)'],
      ],
      [
        'an async function',
        'async def f(a, flag: bool):\n    if flag:\n        return a\n',
        ['boolean-flag-parameter:1 f(flag)'],
      ],
      [
        'two flags',
        'def f(a: bool, b: bool):\n    if a:\n        return 1\n    return 2 if b else 3\n',
        ['boolean-flag-parameter:1 f(a)', 'boolean-flag-parameter:1 f(b)'],
      ],
      [
        'a flag in a match subject',
        'def f(a, flag: bool):\n    match flag:\n        case True:\n            return a\n',
        ['boolean-flag-parameter:1 f(flag)'],
      ],
      [
        'a flag in a comprehension filter',
        'def f(items, flag: bool):\n    return [item for item in items if flag]\n',
        ['boolean-flag-parameter:1 f(flag)'],
      ],
      [
        'a flag in an assert',
        'def f(a, flag: bool):\n    assert flag\n    return a\n',
        ['boolean-flag-parameter:1 f(flag)'],
      ],
      [
        'a flag compared with a boolean literal',
        'def f(a, flag: bool):\n    if flag is True:\n        return a\n    if False == flag:\n        return 1\n',
        ['boolean-flag-parameter:1 f(flag)'],
      ],
      [
        'a flag used in a nested closure',
        'def f(items, flag: bool):\n    return list(map(lambda item: item if flag else None, items))\n',
        ['boolean-flag-parameter:1 f(flag)'],
      ],
      [
        'an Annotated boolean, while an Optional one is a tri-state',
        'from typing import Annotated, Optional\n\n\ndef f(a, x: Optional[bool], y: Annotated[bool, "doc"]):\n    if x:\n        return a\n    return 1 if y else 2\n',
        ['boolean-flag-parameter:4 f(y)', 'tri-state-boolean:4 f(x)'],
      ],
      [
        'a module function named like a setter, a builder or a factory',
        'def set_up_db(dry_run: bool):\n    if dry_run:\n        return 1\n\n\ndef from_config(strict: bool):\n    return 1 if strict else 2\n\n\ndef with_retries(on: bool):\n    return 1 if on else 2\n',
        [
          'boolean-flag-parameter:1 set_up_db(dry_run)',
          'boolean-flag-parameter:6 from_config(strict)',
          'boolean-flag-parameter:10 with_retries(on)',
        ],
      ],
      [
        'a method named from_ that is not a classmethod or a staticmethod',
        'class A:\n    def from_level(self, strict: bool):\n        return 1 if strict else 2\n',
        ['boolean-flag-parameter:2 A.from_level(strict)'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves keyword-only flags, pass-through flags and signatures other code fixes', () => {
    const [actual, expected] = outcomes([
      ['a keyword-only flag', 'def f(a, *, flag: bool):\n    if flag:\n        return a\n', []],
      ['a flag that is only passed on', 'def f(a, flag: bool):\n    return g(a, flag)\n', []],
      ['a flag that is only stored', 'def f(a, flag: bool):\n    return [a, flag]\n', []],
      [
        'a comparison with the flag',
        'def f(a, flag: bool):\n    if flag == a:\n        return 1\n',
        [],
      ],
      ['a private function', 'def _f(a, flag: bool):\n    if flag:\n        return a\n', []],
      [
        'a method of a private class',
        'class _Mailer:\n    def deliver(self, flag: bool):\n        if flag:\n            return 1\n',
        [],
      ],
      [
        'a nested function',
        'def outer(a):\n    def inner(flag: bool):\n        return a if flag else 1\n    return inner\n',
        [],
      ],
      [
        'a constructor',
        'class A:\n    def __init__(self, strict: bool = False):\n        if strict:\n            self.x = 1\n',
        [],
      ],
      [
        'setters and builders',
        'class A:\n    def set_flag(self, flag: bool):\n        if flag:\n            self.x = 1\n    def with_flag(self, flag: bool):\n        if flag:\n            self.x = 1\n    @classmethod\n    def from_mode(cls, strict: bool):\n        if strict:\n            return cls()\n',
        [],
      ],
      [
        'a property setter',
        'class A:\n    @property\n    def x(self):\n        return 1\n    @x.setter\n    def x(self, value: bool):\n        if value:\n            self._x = 1\n',
        [],
      ],
      [
        'an override',
        'from typing import override\n\n\nclass A(B):\n    @override\n    def run(self, flag: bool):\n        if flag:\n            return 1\n',
        [],
      ],
      [
        'an abstract method',
        'import abc\n\n\nclass A(abc.ABC):\n    @abc.abstractmethod\n    def run(self, flag: bool):\n        if flag:\n            return 1\n',
        [],
      ],
      [
        'a framework default',
        'def f(a, flag: bool = Query(False)):\n    if flag:\n        return a\n',
        [],
      ],
      [
        'a boolean annotated by a union without bool',
        'def f(a, flag: int | None = None):\n    if flag:\n        return a\n',
        [],
      ],
      [
        'a loop variable that shadows the flag',
        'def f(items, flag: bool):\n    for flag in items:\n        if flag:\n            return 1\n',
        [],
      ],
      [
        'a comprehension variable that shadows the flag',
        'def f(items, flag: bool):\n    return [flag for flag in items if flag]\n',
        [],
      ],
      [
        'a lambda parameter that shadows the flag',
        'def f(items, flag: bool):\n    return list(filter(lambda flag: flag, items))\n',
        [],
      ],
      [
        'a union of an int and a bool',
        'def f(a, flag: int | bool):\n    if flag:\n        return a\n',
        [],
      ],
      [
        'a union of a bool and a string',
        'from typing import Union\n\n\ndef f(a, flag: Union[bool, str]):\n    if flag:\n        return a\n',
        [],
      ],
      [
        'a pydantic validator',
        'class M:\n    @field_validator("x")\n    def check(cls, value, strict: bool = False):\n        if strict:\n            return value\n',
        [],
      ],
      [
        'a classmethod factory and a staticmethod builder',
        'class A:\n    @classmethod\n    def from_mode(cls, strict: bool):\n        return cls() if strict else cls()\n\n    @staticmethod\n    def of(strict: bool):\n        return 1 if strict else 2\n',
        [],
      ],
      [
        'a test file',
        inFile('tests/test_a.py', 'def f(a, flag: bool):\n    if flag:\n        return a\n'),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
