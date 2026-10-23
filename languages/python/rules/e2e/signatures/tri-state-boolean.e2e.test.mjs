import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });

describe.skipIf(!enabled)('tri-state-boolean', () => {
  it('flags a boolean that can also be None in a parameter, a field and a return', () => {
    const [actual, expected] = outcomes([
      [
        'a parameter with a default',
        'def send(message: str, *, urgent: bool | None = None) -> None:\n    pass\n',
        ['tri-state-boolean:1 send(urgent)'],
      ],
      [
        'Optional[bool]',
        'from typing import Optional\n\n\ndef send(urgent: Optional[bool]) -> None:\n    pass\n',
        ['tri-state-boolean:4 send(urgent)'],
      ],
      [
        'Union with None, in either order',
        'from typing import Union\n\n\ndef a(x: Union[bool, None]) -> None:\n    pass\n\n\ndef b(x: None | bool) -> None:\n    pass\n',
        ['tri-state-boolean:4 a(x)', 'tri-state-boolean:8 b(x)'],
      ],
      [
        'a string annotation',
        'def send(urgent: "bool | None") -> None:\n    pass\n',
        ['tri-state-boolean:1 send(urgent)'],
      ],
      [
        'Annotated',
        'from typing import Annotated\n\n\ndef send(urgent: Annotated[bool | None, "flag"]) -> None:\n    pass\n',
        ['tri-state-boolean:4 send(urgent)'],
      ],
      [
        'a return value',
        'def consent(user: str) -> bool | None:\n    return None\n',
        ['tri-state-boolean:1 consent()'],
      ],
      [
        'a method parameter and a constructor',
        'class Profile:\n    def __init__(self, active: bool | None = None) -> None:\n        self.active = active\n\n    def renew(self, urgent: bool | None) -> None:\n        pass\n',
        [
          'tri-state-boolean:2 Profile.__init__(active)',
          'tri-state-boolean:5 Profile.renew(urgent)',
        ],
      ],
      [
        'a class field and an attribute set in the constructor',
        'from dataclasses import dataclass\n\n\n@dataclass(frozen=True)\nclass Profile:\n    newsletter: bool | None = None\n    name: str = ""\n\n    def start(self) -> None:\n        self.active: bool | None = None\n',
        ['tri-state-boolean:6 Profile.newsletter', 'tri-state-boolean:10 Profile.active'],
      ],
      ['a module variable', 'DEBUG: bool | None = None\n', ['tri-state-boolean:1 DEBUG']],
      [
        'an async function and a keyword-only parameter',
        'async def fetch(*, cache: bool | None = None) -> bool | None:\n    return cache\n',
        ['tri-state-boolean:1 fetch()', 'tri-state-boolean:1 fetch(cache)'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves plain booleans, other optionals and fixed signatures alone', () => {
    const [actual, expected] = outcomes([
      [
        'a boolean with a default',
        'def send(*, urgent: bool = False) -> bool:\n    return urgent\n',
        [],
      ],
      [
        'an optional of another type',
        'def find(name: str | None = None, count: int | None = None) -> str | None:\n    return name\n',
        [],
      ],
      [
        'a union of a boolean and another type',
        'def parse(value: bool | str | None) -> bool | int | None:\n    return None\n',
        [],
      ],
      [
        'a context manager exit',
        'class Scope:\n    def __exit__(self, *arguments: object) -> bool | None:\n        return None\n',
        [],
      ],
      [
        'an override and an overload',
        'from typing import overload, override\n\n\nclass Child(Base):\n    @override\n    def check(self, flag: bool | None) -> bool | None:\n        return flag\n\n\n@overload\ndef read(flag: bool | None) -> int: ...\n@overload\ndef read(flag: int) -> str: ...\ndef read(flag):\n    return flag\n',
        [],
      ],
      [
        'a local variable',
        'def run() -> None:\n    found: bool | None = None\n    print(found)\n',
        [],
      ],
      ['a type alias', 'Flag = bool | None\n', []],
      [
        'a test file',
        inFile('tests/test_mod.py', 'def helper(flag: bool | None = None) -> None:\n    pass\n'),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
