import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });
function inAdapters(rows) {
  return rows.map(([name, code, found]) => [name, inFile('adapters/m.py', code), found]);
}

describe.skipIf(!enabled)('module-level-mutable-state', () => {
  it('flags each place a function changes a module collection', () => {
    const [actual, expected] = outcomes([
      [
        'item assignment',
        'ITEMS = {}\n\n\ndef add(key, value):\n    ITEMS[key] = value\n',
        ['module-level-mutable-state:5 ITEMS in add'],
      ],
      [
        'append',
        'ITEMS = []\n\n\ndef add(value):\n    ITEMS.append(value)\n',
        ['module-level-mutable-state:5 ITEMS in add'],
      ],
      [
        'update through a method',
        'ITEMS: dict[str, int] = {}\n\n\nclass A:\n    def add(self, key):\n        ITEMS.update({key: 1})\n',
        ['module-level-mutable-state:6 ITEMS in add'],
      ],
      [
        'a constructor call',
        'from collections import defaultdict\n\nITEMS = defaultdict(list)\n\n\ndef add(key):\n    ITEMS[key].append(1)\n',
        ['module-level-mutable-state:7 ITEMS in add'],
      ],
      [
        'a subscripted constructor and dict.fromkeys',
        'SEEN = set[str]()\nSLOTS = dict.fromkeys("ab")\n\n\ndef add(x):\n    SEEN.add(x)\n    SLOTS[x] = 1\n',
        ['module-level-mutable-state:6 SEEN in add', 'module-level-mutable-state:7 SLOTS in add'],
      ],
      [
        'a tuple definition',
        'SEEN, DONE = set(), set()\n\n\ndef add(x):\n    DONE.add(x)\n',
        ['module-level-mutable-state:5 DONE in add'],
      ],
      [
        'every change is its own finding',
        'ITEMS = set()\n\n\ndef a(x):\n    ITEMS.add(x)\n\n\ndef b(x):\n    ITEMS.discard(x)\n',
        ['module-level-mutable-state:5 ITEMS in a', 'module-level-mutable-state:9 ITEMS in b'],
      ],
      [
        'del of an item',
        'ITEMS = {}\n\n\ndef drop(key):\n    del ITEMS[key]\n',
        ['module-level-mutable-state:5 ITEMS in drop'],
      ],
      [
        'a local alias',
        'ITEMS = []\n\n\ndef add(value):\n    items = ITEMS\n    items.append(value)\n',
        ['module-level-mutable-state:6 ITEMS in add'],
      ],
      [
        'a bound method',
        'ITEMS = []\npush = ITEMS.append\n\n\ndef add(value):\n    push(value)\n',
        ['module-level-mutable-state:6 ITEMS in add'],
      ],
      [
        'a module instance changed by attribute',
        'from types import SimpleNamespace\n\nSTATE = SimpleNamespace(count=0, names=[])\n\n\ndef hit(name):\n    STATE.count += 1\n    STATE.names.append(name)\n    setattr(STATE, "last", name)\n',
        [
          'module-level-mutable-state:7 STATE in hit',
          'module-level-mutable-state:8 STATE in hit',
          'module-level-mutable-state:9 STATE in hit',
        ],
      ],
      [
        'an instance of a class of the file',
        'class State:\n    count = 0\n\n\nSTATE = State()\n\n\ndef hit():\n    STATE.count += 1\n',
        ['module-level-mutable-state:9 STATE in hit'],
      ],
      [
        'a class attribute collection changed through cls, self and the class',
        'class Registry:\n    handlers = []\n\n    @classmethod\n    def add(cls, h):\n        cls.handlers.append(h)\n\n    def put(self, h):\n        self.handlers.append(h)\n\n\ndef add(h):\n    Registry.handlers.append(h)\n',
        [
          'module-level-mutable-state:6 Registry.handlers in add',
          'module-level-mutable-state:9 Registry.handlers in put',
          'module-level-mutable-state:13 Registry.handlers in add',
        ],
      ],
      [
        'an instance attribute with the class attribute name',
        'class Box:\n    items = []\n\n    def __init__(self):\n        self.items = []\n\n    def put(self, v):\n        self.items.append(v)\n',
        [],
      ],
      [
        'a collection only read',
        'ITEMS = {"a": 1}\n\n\ndef get(key):\n    return ITEMS[key]\n',
        [],
      ],
      ['a tuple', 'ITEMS = (1, 2)\n\n\ndef first():\n    return ITEMS[0]\n', []],
      [
        'a frozen dataclass instance',
        'from dataclasses import dataclass\n\n\n@dataclass(frozen=True)\nclass Settings:\n    debug: bool = False\n\n\nSETTINGS = Settings()\n\n\ndef f():\n    return SETTINGS.debug\n',
        [],
      ],
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
    expect(actual).toEqual(expected);
  });

  it('follows a collection imported from another module', () => {
    const files = {
      'src/shop/registry.py': 'HANDLERS = {}\n\n\ndef lookup(name):\n    return HANDLERS[name]\n',
      'src/shop/wiring.py':
        'from shop.registry import HANDLERS\nfrom shop import registry\nfrom shop.registry import HANDLERS as table\n\n\ndef wire(name, handler):\n    HANDLERS[name] = handler\n    registry.HANDLERS.update({name: handler})\n    table.pop(name)\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'module-level-mutable-state src/shop/wiring.py:7 HANDLERS in wire',
      'module-level-mutable-state src/shop/wiring.py:8 HANDLERS in wire',
      'module-level-mutable-state src/shop/wiring.py:9 HANDLERS in wire',
    ]);
  });
});

describe.skipIf(!enabled)('unsafe-path-join', () => {
  const read = (body, head = 'from pathlib import Path\n\nBASE = Path("/srv")\n') =>
    `${head}\n\ndef read(name):\n${body}`;

  it('flags a path built from a parameter that reaches a file operation unchecked', () => {
    const [actual, expected] = outcomes([
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
    expect(actual).toEqual(expected);
  });

  it('follows a parameter through loops, closures, models, helpers and archives', () => {
    const files = {
      'src/shop/files/locate.py':
        'from pathlib import Path\n\nROOT = Path("/srv/data").resolve()\n\n\ndef locate(name: str) -> Path:\n    return ROOT / name\n',
      'src/shop/files/reads.py':
        'from shop.files.locate import ROOT, locate\n\n\ndef via(name):\n    return locate(name).read_text()\n\n\ndef loop(names: list[str]):\n    for name in names:\n        (ROOT / name).read_text()\n\n\ndef comprehension(names):\n    return [(ROOT / name).read_text() for name in names]\n\n\ndef closure(name):\n    def inner():\n        return (ROOT / name).read_text()\n\n    return inner()\n',
      'src/shop/files/sinks.py':
        'import zipfile\nfrom dataclasses import dataclass\nfrom pathlib import Path\n\nROOT = Path("/srv/data").resolve()\n\n\n@dataclass(frozen=True)\nclass Download:\n    filename: str\n\n\ndef model(request: Download):\n    return (ROOT / request.filename).read_text()\n\n\ndef archive(name):\n    return zipfile.ZipFile(ROOT / name)\n\n\ndef pattern(name):\n    return ROOT.glob(f"{name}/*")\n\n\ndef parent(name):\n    return (ROOT / Path(name).parent / "a.txt").read_text()\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'unsafe-path-join src/shop/files/reads.py:5 via',
      'unsafe-path-join src/shop/files/reads.py:10 loop',
      'unsafe-path-join src/shop/files/reads.py:14 comprehension',
      'unsafe-path-join src/shop/files/reads.py:19 inner',
      'unsafe-path-join src/shop/files/sinks.py:14 model',
      'unsafe-path-join src/shop/files/sinks.py:18 archive',
      'unsafe-path-join src/shop/files/sinks.py:22 pattern',
      'unsafe-path-join src/shop/files/sinks.py:26 parent',
    ]);
  });

  it('does not accept an unrelated check or a lexical containment test', () => {
    const [actual, expected] = outcomes([
      [
        'an unrelated startswith',
        read(
          '    if name.startswith("_"):\n        raise ValueError(name)\n    return (BASE / name).read_text()\n',
        ),
        ['unsafe-path-join:9 read'],
      ],
      [
        'is_relative_to without resolve',
        read(
          '    target = BASE / name\n    if not target.is_relative_to(BASE):\n        raise ValueError(name)\n    return target.read_text()\n',
        ),
        ['unsafe-path-join:10 read'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('accepts a resolved path that is checked to stay inside the base', () => {
    const [actual, expected] = outcomes([
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
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('handwritten-boundary-guard', () => {
  it('flags isinstance checks on parsed data and predicates over Any', () => {
    const [actual, expected] = outcomes([
      [
        'json.loads',
        'import json\n\n\ndef parse(text):\n    data = json.loads(text)\n    if isinstance(data, dict):\n        return data\n    return {}\n',
        ['handwritten-boundary-guard:6 isinstance(data, dict)'],
      ],
      [
        'a nested access',
        'import json\n\n\ndef parse(text):\n    data = json.loads(text)\n    return isinstance(data["a"], str)\n',
        ['handwritten-boundary-guard:6 isinstance(data, str)'],
      ],
      [
        'request.json()',
        'def parse(request):\n    body = request.json()\n    return isinstance(body, list)\n',
        ['handwritten-boundary-guard:3 isinstance(body, list)'],
      ],
      [
        'an Any parameter',
        'from typing import Any\n\n\ndef parse(value: Any):\n    return isinstance(value, str)\n',
        ['handwritten-boundary-guard:5 isinstance(value, str)'],
      ],
      [
        'yaml.safe_load',
        'import yaml\n\n\ndef parse(text):\n    data = yaml.safe_load(text)\n    return isinstance(data, dict)\n',
        ['handwritten-boundary-guard:6 isinstance(data, dict)'],
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
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('handwritten-boundary-guard through other forms', () => {
  it('follows parsed data through names, loops, helpers, patterns and annotations', () => {
    const files = {
      'src/shop/decode.py':
        'import json\nfrom typing import Any\n\n\ndef decode(text: str) -> Any:\n    return json.loads(text)\n\n\ndef decode_again(text):\n    return decode(text)\n',
      'src/shop/guards.py':
        'import json\nfrom collections.abc import Mapping\nfrom typing import Any, TypeGuard\n\nfrom shop.decode import decode, decode_again\n\nloads = json.loads\n\n\ndef alias(text):\n    data = json.loads(text)\n    payload = data\n    return isinstance(payload, dict)\n\n\ndef helper(text):\n    return isinstance(decode(text), dict)\n\n\ndef chained(text):\n    data = decode_again(text)\n    return isinstance(data, list)\n\n\ndef reference(text):\n    data = loads(text)\n    return isinstance(data, list)\n\n\ndef loop(text):\n    for item in json.loads(text):\n        return isinstance(item, dict)\n\n\ndef comprehension(text):\n    return [item for item in json.loads(text) if isinstance(item, dict)]\n\n\ndef match_it(text):\n    match json.loads(text):\n        case {"id": int(ident)}:\n            return ident\n        case _:\n            return 0\n\n\ndef by_type(text):\n    data = json.loads(text)\n    return type(data) is dict\n\n\ndef by_attribute(text):\n    data = json.loads(text)\n    return hasattr(data, "items")\n\n\ndef parameter(payload: dict[str, Any]):\n    return isinstance(payload["total"], int)\n\n\ndef opaque(payload: object):\n    return isinstance(payload, int)\n\n\ndef is_order(value: Mapping[str, object]) -> TypeGuard[dict[str, int]]:\n    return True\n\n\nclass Checker:\n    def is_order(self, value: object) -> TypeGuard[dict[str, int]]:\n        return True\n\n    def __eq__(self, other: object) -> bool:\n        return isinstance(other, Checker)\n',
    };

    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      'handwritten-boundary-guard src/shop/guards.py:13 isinstance(payload, dict)',
      'handwritten-boundary-guard src/shop/guards.py:17 isinstance(decode(), dict)',
      'handwritten-boundary-guard src/shop/guards.py:22 isinstance(data, list)',
      'handwritten-boundary-guard src/shop/guards.py:27 isinstance(data, list)',
      'handwritten-boundary-guard src/shop/guards.py:32 isinstance(item, dict)',
      'handwritten-boundary-guard src/shop/guards.py:36 isinstance(item, dict)',
      'handwritten-boundary-guard src/shop/guards.py:41 match(json.loads())',
      'handwritten-boundary-guard src/shop/guards.py:49 type(data)',
      'handwritten-boundary-guard src/shop/guards.py:54 hasattr(data)',
      'handwritten-boundary-guard src/shop/guards.py:58 isinstance(payload, int)',
      'handwritten-boundary-guard src/shop/guards.py:62 isinstance(payload, int)',
      'handwritten-boundary-guard src/shop/guards.py:65 is_order',
      'handwritten-boundary-guard src/shop/guards.py:70 is_order',
    ]);
  });
});

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
