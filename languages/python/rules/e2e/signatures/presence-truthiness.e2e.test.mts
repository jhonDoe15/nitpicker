import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['number-truthiness', 'tri-state-boolean', 'boolean-flag-parameter'],
});
afterEach(cleanup);

describe.skipIf(!enabled)('presence-truthiness', () => {
  it('flags an optional string or boolean that a test or an or default treats as missing', () => {
    const [actual, expected] = outcomes([
      [
        'a conditional expression on an optional string',
        'from typing import Optional\n\n\ndef line(event_id: Optional[str]) -> str:\n    return f"id: {event_id}" if event_id else ""\n',
        ['presence-truthiness:5 line(event_id)'],
      ],
      [
        'an if whose branch uses the value',
        'def label(title: str | None) -> str:\n    if title:\n        return title.strip()\n    return "untitled"\n',
        ['presence-truthiness:2 label(title)'],
      ],
      [
        'an or default on an annotated optional boolean local',
        'def secure(flag: bool | None, default: bool) -> bool:\n    chosen: bool | None = flag\n    return chosen or default\n',
        ['presence-truthiness:3 secure(chosen)'],
      ],
      [
        'filter(None, ...) over optional strings',
        'def present(values: list[str | None]) -> list[str | None]:\n    return list(filter(None, values))\n',
        ['presence-truthiness:2 present(values)'],
      ],
      [
        'a comprehension that keeps truthy elements',
        'def present(values: list[str | None]) -> list[str | None]:\n    return [value for value in values if value]\n',
        ['presence-truthiness:2 present(values)'],
      ],
      [
        'an attribute of an annotated class read through self and a parameter',
        'class Tag:\n    name: str | None\n\n    def label(self) -> str:\n        return self.name or "d"\n\n\ndef show(tag: Tag) -> str:\n    if tag.name:\n        return tag.name.strip()\n    return ""\n',
        ['presence-truthiness:5 Tag.label(self.name)', 'presence-truthiness:9 show(tag.name)'],
      ],
      [
        'a negated guard that returns, and an and operand that uses the value',
        'def a(x: str | None) -> int:\n    if not x:\n        return 0\n    return len(x)\n\n\ndef b(x: str | None) -> object:\n    return x and x.strip()\n',
        ['presence-truthiness:2 a(x)', 'presence-truthiness:8 b(x)'],
      ],
      [
        'a dict comprehension that keeps truthy values',
        'def keep(d: dict[str, str | None]) -> dict:\n    return {k: v for k, v in d.items() if v}\n',
        ['presence-truthiness:2 keep(d)'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves None tests, plain strings and booleans, and an empty default alone', () => {
    const [actual, expected] = outcomes([
      [
        'is not None tests',
        'def label(title: str | None) -> str:\n    return title if title is not None else ""\n',
        [],
      ],
      [
        'a plain string and a plain boolean',
        'def run(name: str, flag: bool) -> str:\n    if name:\n        return name\n    return "a" if flag else "b"\n',
        [],
      ],
      [
        'an or default of the empty string',
        'def run(chosen: str | None) -> str:\n    local: str | None = chosen\n    return local or ""\n',
        [],
      ],
      [
        'a test that does not use the value',
        'def run(title: str | None) -> int:\n    return 1 if title else 2\n',
        [],
      ],
      [
        'a rebound name',
        'def run(title: str | None, rows: list[str]) -> str:\n    title = rows[0]\n    return title.strip() if title else ""\n',
        [],
      ],
      [
        'a nested function that shadows the name with a plain string',
        'def outer(x: str | None) -> object:\n    def inner(x: str) -> str:\n        if x:\n            return x.strip()\n        return ""\n    return inner\n',
        [],
      ],
      [
        'a value narrowed by a None guard that exits',
        'def run(x: str | None) -> str:\n    if x is None:\n        raise ValueError("x")\n    if x:\n        return x.strip()\n    return ""\n',
        [],
      ],
      [
        'a number that number-truthiness reports',
        'def run(count: int | None) -> int:\n    return count if count else 0\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
