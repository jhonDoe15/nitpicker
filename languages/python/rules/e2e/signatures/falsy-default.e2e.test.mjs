import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });

describe.skipIf(!enabled)('falsy-default', () => {
  it('flags a None-defaulted parameter that `or` or a truthiness conditional replaces', () => {
    const [actual, expected] = outcomes([
      [
        'an assignment',
        'def page(limit: int | None = None) -> int:\n    size = limit or 10\n    return size\n',
        ['falsy-default:2 page(limit)'],
      ],
      [
        'a rebinding to itself with a non-empty default',
        'def pad(items: list[str] | None = None) -> list[str]:\n    items = items or ["a"]\n    return items\n',
        ['falsy-default:2 pad(items)'],
      ],
      [
        'a return',
        'def label(name: str = None) -> str:\n    return name or "all"\n',
        ['falsy-default:2 label(name)'],
      ],
      [
        'a call argument',
        'def run(timeout: float | None = None) -> None:\n    wait(timeout or 5.0)\n',
        ['falsy-default:2 run(timeout)'],
      ],
      [
        'a conditional expression on the value',
        'def label(name: str | None = None) -> str:\n    return name if name else "all"\n',
        ['falsy-default:2 label(name)'],
      ],
      [
        'a chain of alternatives',
        'def pick(first: int | None = None, second: int | None = None) -> int:\n    return first or second or 3\n',
        ['falsy-default:2 pick(first)', 'falsy-default:2 pick(second)'],
      ],
      [
        'an Optional without a default',
        'from typing import Optional\n\n\ndef scale(factor: Optional[float]) -> float:\n    return factor or 1.0\n',
        ['falsy-default:5 scale(factor)'],
      ],
      [
        'a method',
        'class Pager:\n    def size(self, limit: int | None = None) -> int:\n        return limit or 10\n',
        ['falsy-default:3 Pager.size(limit)'],
      ],
      [
        'one finding per parameter',
        'def page(limit: int | None = None) -> int:\n    first = limit or 10\n    return (limit or 20) + first\n',
        ['falsy-default:2 page(limit)'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves None tests, conditions and parameters of other types alone', () => {
    const [actual, expected] = outcomes([
      [
        'an empty default, which the falsy value already is',
        'def pad(items: list[str] | None = None, name: str | None = None, n: int | None = None) -> None:\n    first = items or []\n    second = name or ""\n    third = n or 0\n    fourth = items or list()\n    fifth = name if name else ""\n',
        [],
      ],
      [
        'a None test',
        'def page(limit: int | None = None) -> int:\n    return limit if limit is not None else 10\n',
        [],
      ],
      [
        'a None check before the or',
        'def page(limit: int | None = None) -> int:\n    if limit is None:\n        limit = 1\n    return limit or 10\n',
        [],
      ],
      [
        'a condition',
        'def page(limit: int | None = None, name: str | None = None) -> bool:\n    if limit or name:\n        return True\n    return bool(limit or name) and not (limit or name)\n',
        [],
      ],
      [
        'a comprehension filter and an assert',
        'def keep(items: list[int], limit: int | None = None) -> list[int]:\n    assert limit or items\n    return [item for item in items if limit or item]\n',
        [],
      ],
      [
        'a class without a falsy value',
        'from pathlib import Path\n\n\ndef where(root: Path | None = None) -> Path:\n    return root or Path.cwd()\n',
        [],
      ],
      ['an unannotated parameter', 'def label(name=None):\n    return name or "all"\n', []],
      [
        'a project class',
        'def build(config: Config | None = None) -> Config:\n    return config or Config()\n',
        [],
      ],
      [
        'a parameter without a None default',
        'def label(name: str = "x") -> str:\n    return name or "all"\n',
        [],
      ],
      [
        'a local variable',
        'def label(values: list[str]) -> str:\n    name = values[0] if values else None\n    return name or "all"\n',
        [],
      ],
      [
        'a test file',
        inFile(
          'tests/test_mod.py',
          'def helper(limit: int | None = None) -> int:\n    return limit or 10\n',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
