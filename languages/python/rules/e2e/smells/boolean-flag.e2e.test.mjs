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
        'an optional boolean in a negated condition',
        'def f(a, flag: bool | None = None):\n    if not flag:\n        return a\n    return 1\n',
        ['boolean-flag-parameter:1 f(flag)'],
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
        ['boolean-flag-parameter:2 deliver(flag)'],
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
        'a test file',
        inFile('tests/test_a.py', 'def f(a, flag: bool):\n    if flag:\n        return a\n'),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
