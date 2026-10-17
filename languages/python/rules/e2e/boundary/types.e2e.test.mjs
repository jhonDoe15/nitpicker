import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });
function inAdapters(rows) {
  return rows.map(([name, code, found]) => [name, inFile('adapters/m.py', code), found]);
}

describe.skipIf(!enabled)('any in domain code and in pydantic models', () => {
  it('flags Any in annotations under domain/', () => {
    const [actual, expected] = outcomes([
      [
        'a parameter',
        inFile('domain/a.py', 'from typing import Any\n\n\ndef f(x: Any) -> int:\n    return 1\n'),
        ['any-in-domain:4 f'],
      ],
      [
        'a return type',
        inFile('domain/a.py', 'from typing import Any\n\n\ndef f(x: int) -> Any:\n    return x\n'),
        ['any-in-domain:4 f'],
      ],
      [
        'inside a generic',
        inFile(
          'domain/a.py',
          'import typing\n\n\ndef f(x: typing.Dict[str, typing.Any]) -> int:\n    return 1\n',
        ),
        ['any-in-domain:4 f'],
      ],
      [
        'a class attribute',
        inFile('domain/a.py', 'from typing import Any\n\n\nclass A:\n    value: Any\n'),
        ['any-in-domain:5 A'],
      ],
      [
        'a method',
        inFile(
          'domain/a.py',
          'from typing import Any\n\n\nclass A:\n    def f(self, x: Any) -> None:\n        pass\n',
        ),
        ['any-in-domain:5 A.f'],
      ],
      [
        'a string annotation',
        inFile('domain/a.py', 'def f(x: "Any") -> int:\n    return 1\n'),
        ['any-in-domain:1 f'],
      ],
      ['no Any', inFile('domain/a.py', 'def f(x: int) -> str:\n    return str(x)\n'), []],
      ['object', inFile('domain/a.py', 'def f(x: object) -> int:\n    return 1\n'), []],
      [
        'Any outside the domain',
        inFile('src/a.py', 'from typing import Any\n\n\ndef f(x: Any) -> int:\n    return 1\n'),
        [],
      ],
      [
        'Any in a domain test',
        inFile(
          'tests/domain/test_a.py',
          'from typing import Any\n\n\ndef f(x: Any) -> int:\n    return 1\n',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('flags an Any field of a pydantic model anywhere', () => {
    const model = (body, base = 'BaseModel', imports = 'from pydantic import BaseModel') =>
      `from typing import Any\n${imports}\n\n\nclass M(${base}):\n${body}`;
    const [actual, expected] = outcomes(
      inAdapters([
        ['an Any field', model('    value: Any\n'), ['pydantic-any-field:6 M.value']],
        [
          'an optional Any',
          model('    value: Any | None = None\n'),
          ['pydantic-any-field:6 M.value'],
        ],
        ['a list of Any', model('    value: list[Any]\n'), ['pydantic-any-field:6 M.value']],
        [
          'a model that extends another model',
          `${model('    value: str\n')}\n\nclass N(M):\n    other: Any\n`,
          ['pydantic-any-field:10 N.other'],
        ],
        [
          'pydantic.BaseModel',
          model('    value: Any\n', 'pydantic.BaseModel', 'import pydantic'),
          ['pydantic-any-field:6 M.value'],
        ],
        [
          'BaseSettings',
          model('    value: Any\n', 'BaseSettings', 'from pydantic_settings import BaseSettings'),
          ['pydantic-any-field:6 M.value'],
        ],
        ['a typed field', model('    value: str\n'), []],
        [
          'an Any field of a plain class',
          'from typing import Any\n\n\nclass M:\n    value: Any\n',
          [],
        ],
      ]),
    );
    expect(actual).toEqual(expected);
  });

  it('flags a pydantic model that accepts unknown fields', () => {
    const model = (body, imports = 'from pydantic import BaseModel, ConfigDict') =>
      `${imports}\n\n\nclass M(BaseModel):\n${body}`;
    const [actual, expected] = outcomes(
      inAdapters([
        [
          'ConfigDict(extra="allow")',
          model('    model_config = ConfigDict(extra="allow")\n'),
          ['pydantic-extra-allow:4 M'],
        ],
        [
          'a dict config',
          model('    model_config = {"extra": "allow"}\n'),
          ['pydantic-extra-allow:4 M'],
        ],
        [
          'a class keyword',
          'from pydantic import BaseModel\n\n\nclass M(BaseModel, extra="allow"):\n    name: str\n',
          ['pydantic-extra-allow:4 M'],
        ],
        [
          'the v1 Config class',
          model('    class Config:\n        extra = "allow"\n'),
          ['pydantic-extra-allow:4 M'],
        ],
        [
          'Extra.allow',
          model(
            '    class Config:\n        extra = Extra.allow\n',
            'from pydantic import BaseModel, Extra',
          ),
          ['pydantic-extra-allow:4 M'],
        ],
        [
          'an annotated model_config',
          model('    model_config: ConfigDict = ConfigDict(extra="allow")\n'),
          ['pydantic-extra-allow:4 M'],
        ],
        ['extra="forbid"', model('    model_config = ConfigDict(extra="forbid")\n'), []],
        ['extra="ignore"', model('    model_config = ConfigDict(extra="ignore")\n'), []],
        ['no config', model('    name: str\n'), []],
        ['a class that is no model', 'class M:\n    model_config = {"extra": "allow"}\n', []],
      ]),
    );
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('any behind aliases and models in other files', () => {
  it('resolves aliases, string annotations and functional types in domain code', () => {
    const files = {
      'src/shop/json_types.py':
        'from typing import Any, TypeAlias\n\nPayload = dict[str, Any]\nBlob: TypeAlias = "list[Any]"\nPlain = dict[str, int]\n',
      'src/shop/domain/order.py':
        'from typing import Any, NamedTuple, TypedDict\n\nfrom shop.json_types import Blob, Payload, Plain\n\n\ndef total(order: Payload) -> int:\n    return len(order)\n\n\ndef blob(value: Blob) -> int:\n    return len(value)\n\n\ndef later(order: "dict[str, Any]") -> int:\n    return len(order)\n\n\ndef fine(order: Plain) -> int:\n    return len(order)\n\n\nRow = TypedDict("Row", {"value": Any})\nPair = NamedTuple("Pair", [("value", Any)])\nOk = TypedDict("Ok", {"value": int})\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'any-in-domain src/shop/domain/order.py:6 total',
      'any-in-domain src/shop/domain/order.py:10 blob',
      'any-in-domain src/shop/domain/order.py:14 later',
      'any-in-domain src/shop/domain/order.py:22 Row',
      'any-in-domain src/shop/domain/order.py:23 Pair',
    ]);
  });

  it('follows pydantic bases, shared configs and pydantic dataclasses across files', () => {
    const files = {
      'src/shop/adapters/base.py':
        'from pydantic import BaseModel, ConfigDict\n\nLOOSE = ConfigDict(extra="allow")\n\n\nclass Strict(BaseModel):\n    model_config = ConfigDict(frozen=True)\n',
      'src/shop/adapters/order.py':
        'from typing import Any\n\nfrom pydantic import BaseModel, TypeAdapter\nfrom pydantic.dataclasses import dataclass\n\nfrom shop.adapters.base import LOOSE, Strict\n\n\nclass Order(Strict):\n    payload: Any\n\n\nclass Loose(BaseModel):\n    model_config = LOOSE\n    total: int\n\n\n@dataclass(frozen=True)\nclass Event:\n    payload: Any\n\n\nANY = TypeAdapter(Any)\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'pydantic-any-field src/shop/adapters/order.py:10 Order.payload',
      'pydantic-extra-allow src/shop/adapters/order.py:13 Loose',
      'pydantic-any-field src/shop/adapters/order.py:20 Event.payload',
      'pydantic-any-field src/shop/adapters/order.py:23 TypeAdapter',
    ]);
  });
});
