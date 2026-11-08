import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['pydantic-boundary'] });
afterEach(cleanup);

const ADAPTER = 'from pydantic import TypeAdapter\n\n\n';
const JINJA = 'import jinja2\n\n\n';

describe.skipIf(!enabled)('reusable-object-per-call', () => {
  it('flags a shareable object built in a function that runs on every call', () => {
    const [actual, expected] = outcomes([
      [
        'a TypeAdapter used once',
        `${ADAPTER}def parse(data: bytes) -> list[int]:\n    return TypeAdapter(list[int]).validate_json(data)\n`,
        ['reusable-object-per-call:5 TypeAdapter'],
      ],
      [
        'a TypeAdapter kept in a local',
        `${ADAPTER}def parse(data: bytes) -> list[int]:\n    adapter = TypeAdapter(list[int])\n    return adapter.validate_json(data)\n`,
        ['reusable-object-per-call:5 TypeAdapter'],
      ],
      [
        'a jinja2 environment in a method',
        `${JINJA}class Mailer:\n    def render(self, name: str) -> str:\n        environment = jinja2.Environment(autoescape=True)\n        return environment.from_string("Hi {{ name }}").render(name=name)\n`,
        ['reusable-object-per-call:6 Environment'],
      ],
      [
        'a compiled schema in an async function',
        'import fastjsonschema\n\nSCHEMA = {"type": "object"}\n\n\nasync def valid(data: dict) -> dict:\n    return fastjsonschema.compile(SCHEMA)(data)\n',
        ['reusable-object-per-call:7 compile'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('leaves objects built once, in a cache or from a call value alone', () => {
    const [actual, expected] = outcomes([
      ['module level', `${ADAPTER}NUMBERS = TypeAdapter(list[int])\n`, []],
      [
        'a class attribute and __init__',
        `${ADAPTER}class Reader:\n    numbers = TypeAdapter(list[int])\n\n    def __init__(self) -> None:\n        self.words = TypeAdapter(list[str])\n`,
        [],
      ],
      [
        'a cached factory',
        `import functools\n\n${ADAPTER}@functools.cache\ndef adapter_for(kind: type) -> TypeAdapter:\n    return TypeAdapter(kind)\n`,
        [],
      ],
      [
        'a factory that returns it',
        `${ADAPTER}def numbers() -> TypeAdapter:\n    return TypeAdapter(list[int])\n`,
        [],
      ],
      [
        'a type that comes from the call',
        `${ADAPTER}def parse(kind: type, data: bytes) -> object:\n    return TypeAdapter(kind).validate_json(data)\n`,
        [],
      ],
      [
        'lazy set on an attribute or a global',
        `${ADAPTER}_NUMBERS = None\n\n\ndef numbers() -> object:\n    global _NUMBERS\n    if _NUMBERS is None:\n        _NUMBERS = TypeAdapter(list[int])\n    return _NUMBERS\n`,
        [],
      ],
      [
        'main',
        `${JINJA}def main() -> None:\n    print(jinja2.Environment(autoescape=True).from_string("x").render())\n`,
        [],
      ],
      [
        'a test file',
        {
          file: 'tests/test_parse.py',
          code: `${ADAPTER}def test_parse() -> None:\n    assert TypeAdapter(list[int]).validate_json(b"[1]") == [1]\n`,
        },
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
