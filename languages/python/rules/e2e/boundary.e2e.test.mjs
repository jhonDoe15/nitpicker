import { afterEach, describe, it } from 'vitest';
import { createScripts } from '../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, expectVerdicts } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });
const expectInAdapters = (rows) =>
  expectVerdicts(rows.map(([name, code, found]) => [name, inFile('adapters/m.py', code), found]));

describe.skipIf(!enabled)('module-level-mutable-state', () => {
  it('flags a module collection that a function changes, once, at its definition', () => {
    expectVerdicts([
      [
        'item assignment',
        'ITEMS = {}\n\n\ndef add(key, value):\n    ITEMS[key] = value\n',
        ['module-level-mutable-state:1 ITEMS'],
      ],
      [
        'append',
        'ITEMS = []\n\n\ndef add(value):\n    ITEMS.append(value)\n',
        ['module-level-mutable-state:1 ITEMS'],
      ],
      [
        'update through a method',
        'ITEMS: dict[str, int] = {}\n\n\nclass A:\n    def add(self, key):\n        ITEMS.update({key: 1})\n',
        ['module-level-mutable-state:1 ITEMS'],
      ],
      [
        'a constructor call',
        'from collections import defaultdict\n\nITEMS = defaultdict(list)\n\n\ndef add(key):\n    ITEMS[key].append(1)\n',
        ['module-level-mutable-state:3 ITEMS'],
      ],
      [
        'several changes count once',
        'ITEMS = set()\n\n\ndef a(x):\n    ITEMS.add(x)\n\n\ndef b(x):\n    ITEMS.discard(x)\n',
        ['module-level-mutable-state:1 ITEMS'],
      ],
      [
        'del of an item',
        'ITEMS = {}\n\n\ndef drop(key):\n    del ITEMS[key]\n',
        ['module-level-mutable-state:1 ITEMS'],
      ],
      [
        'a collection only read',
        'ITEMS = {"a": 1}\n\n\ndef get(key):\n    return ITEMS[key]\n',
        [],
      ],
      ['a tuple', 'ITEMS = (1, 2)\n\n\ndef first():\n    return ITEMS[0]\n', []],
      [
        'a local with the same name',
        'ITEMS = []\n\n\ndef f():\n    ITEMS = []\n    ITEMS.append(1)\n    return ITEMS\n',
        [],
      ],
      [
        'a parameter with the same name',
        'ITEMS = []\n\n\ndef f(ITEMS):\n    ITEMS.append(1)\n',
        [],
      ],
      ['a change at module level', 'ITEMS = []\nITEMS.append(1)\n', []],
      ['__all__', '__all__ = ["a"]\n\n\ndef f():\n    __all__.append("b")\n', []],
      [
        'a test file',
        inFile('tests/test_a.py', 'ITEMS = []\n\n\ndef add(v):\n    ITEMS.append(v)\n'),
        [],
      ],
    ]);
  });
});

describe.skipIf(!enabled)('unsafe-path-join', () => {
  const read = (body, head = 'from pathlib import Path\n\nBASE = Path("/srv")\n') =>
    `${head}\n\ndef read(name):\n${body}`;

  it('flags a path built from a parameter that reaches a file operation unchecked', () => {
    expectVerdicts([
      ['a slash join', read('    return (BASE / name).read_text()\n'), ['unsafe-path-join:7 read']],
      [
        'through a variable',
        read('    target = BASE / name\n    return target.read_text()\n'),
        ['unsafe-path-join:8 read'],
      ],
      [
        'os.path.join with open',
        'import os\n\n\ndef read(name):\n    return open(os.path.join("/srv", name))\n',
        ['unsafe-path-join:5 read'],
      ],
      [
        'an f-string',
        'def read(name):\n    return open(f"/srv/{name}")\n',
        ['unsafe-path-join:2 read'],
      ],
      [
        'joinpath',
        read('    return BASE.joinpath(name).read_bytes()\n'),
        ['unsafe-path-join:7 read'],
      ],
      [
        'shutil',
        'import shutil\nfrom pathlib import Path\n\n\ndef copy(name):\n    shutil.copy(Path("/srv") / name, "/out")\n',
        ['unsafe-path-join:6 copy'],
      ],
      [
        'send_from_directory',
        'from flask import send_from_directory\n\n\ndef download(name):\n    return send_from_directory("/srv", name)\n',
        [],
      ],
    ]);
  });

  it('accepts a resolved path that is checked to stay inside the base', () => {
    expectVerdicts([
      [
        'is_relative_to with a raise',
        read(
          '    target = (BASE / name).resolve()\n    if not target.is_relative_to(BASE):\n        raise ValueError(name)\n    return target.read_text()\n',
        ),
        [],
      ],
      [
        'relative_to in a try that exits',
        read(
          '    target = (BASE / name).resolve()\n    try:\n        target.relative_to(BASE)\n    except ValueError as error:\n        raise LookupError(name) from error\n    return target.read_text()\n',
        ),
        [],
      ],
      [
        'a startswith check',
        'import os\n\n\ndef read(name):\n    target = os.path.realpath(os.path.join("/srv", name))\n    if not target.startswith("/srv/"):\n        raise ValueError(name)\n    return open(target)\n',
        [],
      ],
      ['an integer parameter', read('    return (BASE / f"{int(name)}.txt").read_text()\n'), []],
      [
        'a path used as given, without a join',
        'from pathlib import Path\n\n\ndef remove(name: str):\n    Path(name).unlink()\n',
        [],
      ],
      ['only the file name is used', read('    return (BASE / Path(name).name).read_text()\n'), []],
      ['a constant path', read('    return (BASE / "a.txt").read_text()\n'), []],
      [
        'a Literal parameter',
        'from typing import Literal\nfrom pathlib import Path\n\n\ndef read(name: Literal["a", "b"]):\n    return (Path("/srv") / name).read_text()\n',
        [],
      ],
      [
        'a test file',
        inFile('tests/test_a.py', 'def read(name):\n    return open(f"/srv/{name}")\n'),
        [],
      ],
    ]);
  });
});

describe.skipIf(!enabled)('handwritten-boundary-guard', () => {
  it('flags isinstance checks on parsed data and predicates over Any', () => {
    expectVerdicts([
      [
        'json.loads',
        'import json\n\n\ndef parse(text):\n    data = json.loads(text)\n    if isinstance(data, dict):\n        return data\n    return {}\n',
        ['handwritten-boundary-guard:6 isinstance(data)'],
      ],
      [
        'a nested access',
        'import json\n\n\ndef parse(text):\n    data = json.loads(text)\n    return isinstance(data["a"], str)\n',
        ['handwritten-boundary-guard:6 isinstance(data)'],
      ],
      [
        'request.json()',
        'def parse(request):\n    body = request.json()\n    return isinstance(body, list)\n',
        ['handwritten-boundary-guard:3 isinstance(body)'],
      ],
      [
        'an Any parameter',
        'from typing import Any\n\n\ndef parse(value: Any):\n    return isinstance(value, str)\n',
        ['handwritten-boundary-guard:5 isinstance(value)'],
      ],
      [
        'yaml.safe_load',
        'import yaml\n\n\ndef parse(text):\n    data = yaml.safe_load(text)\n    return isinstance(data, dict)\n',
        ['handwritten-boundary-guard:6 isinstance(data)'],
      ],
      [
        'a TypeGuard over Any',
        'from typing import Any, TypeGuard\n\n\ndef is_order(value: Any) -> TypeGuard[dict[str, int]]:\n    return True\n',
        ['handwritten-boundary-guard:4 is_order'],
      ],
      [
        'a TypeIs over object',
        'from typing import TypeIs\n\n\ndef is_name(value: object) -> TypeIs[str]:\n    return True\n',
        ['handwritten-boundary-guard:4 is_name'],
      ],
      [
        'isinstance on an ordinary value',
        'def f(value: int | str):\n    return isinstance(value, int)\n',
        [],
      ],
      [
        'isinstance on data that is not parsed',
        'def f(items):\n    return [i for i in items if isinstance(i, str)]\n',
        [],
      ],
      [
        'a TypeGuard over a union',
        'from typing import TypeGuard\n\n\ndef is_name(value: int | str) -> TypeGuard[str]:\n    return isinstance(value, str)\n',
        [],
      ],
      [
        'a test file',
        inFile(
          'tests/test_a.py',
          'import json\n\n\ndef t(text):\n    data = json.loads(text)\n    assert isinstance(data, dict)\n',
        ),
        [],
      ],
    ]);
  });
});

describe.skipIf(!enabled)('any in domain code and in pydantic models', () => {
  it('flags Any in annotations under domain/', () => {
    expectVerdicts([
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
  });

  it('flags an Any field of a pydantic model anywhere', () => {
    const model = (body, base = 'BaseModel', imports = 'from pydantic import BaseModel') =>
      `from typing import Any\n${imports}\n\n\nclass M(${base}):\n${body}`;
    expectInAdapters([
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
    ]);
  });

  it('flags a pydantic model that accepts unknown fields', () => {
    const model = (body, imports = 'from pydantic import BaseModel, ConfigDict') =>
      `${imports}\n\n\nclass M(BaseModel):\n${body}`;
    expectInAdapters([
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
    ]);
  });
});
