import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const describeE2e = describe.skipIf(process.env.NITPICKER_PYTHON_E2E !== '1');

describeE2e('Python type laundering', () => {
  it('checks quoted aliases and lambda defaults while leaving ordinary indexing alone', () => {
    const [actual, expected] = outcomes([
      [
        'quoted type alias',
        'from typing import TypeAlias, Any\nPayload: TypeAlias = "list[Any]"\n',
        ['explicit-any:2 Payload'],
      ],
      [
        'quoted TypeAlias annotation',
        'from typing import TypeAlias, Any\nPayload: "TypeAlias" = list[Any]\n',
        ['explicit-any:2 Payload'],
      ],
      [
        'quoted generic alias',
        'from typing import Any\nPayload = list["Any"]\n',
        ['explicit-any:2 Payload'],
      ],
      ['shadowed container', 'from typing import Any\nlist = registry\nvalue = list["Any"]\n', []],
      [
        'lambda default',
        'from typing import cast\nname = lambda value=cast(str, source): value\n',
        ['type-cast:2 cast(str)'],
      ],
      [
        'cast in an annotation',
        'from typing import cast\ndef name(value: cast(type, str)):\n    return value\n',
        ['type-cast:2 cast(type) in name'],
      ],
      [
        'string with a line break is reported on its own line',
        'from typing import Any\nvalue: "\\nAny"\n',
        ['explicit-any:2 value'],
      ],
      ['string with a NUL byte', 'value: "\\x00"\nother: list["\\x00"]\n', []],
    ]);
    expect(actual).toEqual(expected);
  });

  it('resolves typing imports without confusing unrelated or shadowed names', () => {
    const [actual, expected] = outcomes([
      ['cast', 'import typing\nvalue = typing.cast(str, source)\n', ['type-cast:2 cast(str)']],
      [
        'renamed cast',
        'from typing import cast as convert\nvalue = convert(str, source)\n',
        ['type-cast:2 cast(str)'],
      ],
      ['extensions', 'import typing_extensions as t\nvalue: t.Any\n', ['explicit-any:2 value']],
      [
        'extensions fallback import',
        'try:\n    from typing import cast\nexcept ImportError:\n    from typing_extensions import cast\nvalue = cast(str, source)\n',
        ['type-cast:5 cast(str)'],
      ],
      ['quoted annotation', 'import typing as t\nvalue: "list[t.Any]"\n', ['explicit-any:2 value']],
      [
        'nested forward reference',
        'from typing import Any\nvalue: list["Any"] | None\n',
        ['explicit-any:2 value'],
      ],
      ['alias declaration', 'from typing import Any\nDynamic = Any\n', ['explicit-any:2 Dynamic']],
      [
        'local import',
        'def name(value):\n    from typing import cast\n    return cast(str, value)\n',
        ['type-cast:3 cast(str) in name'],
      ],
      ['unrelated', 'from shapes import Any, cast\nvalue: Any = cast(str, source)\n', []],
      [
        'parameter shadows import',
        'from typing import cast\ndef name(cast, value):\n    return cast(value)\n',
        [],
      ],
      [
        'assignment shadows import',
        'import typing\ntyping = custom\nvalue = typing.cast(str, source)\n',
        [],
      ],
      [
        'comprehension variable does not shadow the module',
        'from typing import cast\nnames = [cast for cast in sources]\nvalue = cast(str, source)\n',
        ['type-cast:3 cast(str)'],
      ],
      [
        'comprehension variable shadows inside the comprehension',
        'from typing import cast\nvalues = [cast(item) for cast in casts for item in cast]\n',
        [],
      ],
      [
        'match captures shadow',
        'from typing import cast\nmatch command:\n    case [cast, *rest]:\n        value = cast(rest)\n',
        [],
      ],
      [
        'sibling import',
        'def first():\n    from typing import cast\ndef second():\n    return cast(str, source)\n',
        [],
      ],
      [
        'strings are data',
        'from typing import Any, Literal, Annotated\nvalue: Literal["Any"]\nother: Annotated[str, "Any"]\ntext = "typing.Any"\n',
        [],
      ],
      [
        'class scope is not a method closure',
        'import typing\nclass Names:\n    typing = custom\n    def name(self, value):\n        return typing.cast(str, value)\n',
        ['type-cast:5 cast(str) in Names.name'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports the places a reference can hide', () => {
    const [actual, expected] = outcomes([
      [
        'type parameters',
        'from typing import Any\ndef f[T: Any](x: T) -> T:\n    return x\nclass C[U = Any]:\n    pass\nclass D[V: Any]:\n    pass\n',
        ['explicit-any:2 f[T]', 'explicit-any:4 C[U]', 'explicit-any:6 D[V]'],
      ],
      [
        'class keyword',
        'from typing import cast\nclass C(Base, meta=cast(type, source)):\n    pass\n',
        ['type-cast:2 cast(type)'],
      ],
      [
        'subscript target',
        'from typing import cast\ntable[cast(str, key)] = 1\n',
        ['type-cast:2 cast(str)'],
      ],
      [
        'cast as a value',
        'import typing\nfrom functools import partial\nfrom typing import cast\nconvert = partial(cast, int)\nalias = typing.cast\n',
        ['type-cast:4 cast', 'type-cast:5 cast'],
      ],
      [
        'class bases',
        'from typing import Any\nclass C(Base[Any]):\n    pass\n',
        ['explicit-any:2 C(bases)'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports one finding per annotation, named by what it types', () => {
    const [actual, expected] = outcomes([
      [
        'parameters and return',
        'from typing import Any\ndef f(a: Any, b: dict[str, Any] | list[Any]) -> Any:\n    return a\n',
        ['explicit-any:2 f(a)', 'explicit-any:2 f(b)', 'explicit-any:2 f(return)'],
      ],
      [
        'variadic wrapper',
        'from typing import Any\ndef wrap(call):\n    def inner(*args: Any, **kwargs: Any):\n        return call(*args, **kwargs)\n    return inner\n',
        ['explicit-any:3 wrap.inner(args)', 'explicit-any:3 wrap.inner(kwargs)'],
      ],
      [
        'class field',
        'from typing import Any\nclass M:\n    v: Any\n    w: "Any"\n',
        ['explicit-any:3 M.v', 'explicit-any:4 M.w'],
      ],
      [
        'cast with an explicit Any is one finding',
        'from typing import Any, cast\nvalue = cast(Any, source)\nother = cast(list[Any], source)\n',
        ['type-cast:2 cast(Any)', 'type-cast:3 cast(list[Any])'],
      ],
      [
        'wrapper typed with ParamSpec and object',
        'from collections.abc import Callable\nfrom typing import ParamSpec, TypeVar\nP = ParamSpec("P")\nR = TypeVar("R")\ndef wrap(call: Callable[P, R]) -> Callable[P, R]:\n    def inner(*args: P.args, **kwargs: P.kwargs) -> R:\n        return call(*args, **kwargs)\n    return inner\nPayload = dict[str, object]\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('keeps the other findings of a file when one is added above them', () => {
    const body =
      'from typing import Any, cast\ndef f(a: Any):\n    return cast(str, a)\ndef g(a: Any):\n    return cast(str, a)\n';
    const withExtra =
      'from typing import Any, cast\nextra: Any\nprint(cast(str, 1))\ndef f(a: Any):\n    return cast(str, a)\ndef g(a: Any):\n    return cast(str, a)\n';
    const identities = (code) =>
      findingsOf({ 'mod.py': code }).map((line) => line.replace(/ mod\.py:\d+/, ''));

    const before = identities(body);
    const after = identities(withExtra);

    expect(before.filter((line) => after.includes(line))).toEqual(before);
    expect(after.filter((line) => !before.includes(line))).toEqual([
      'explicit-any extra',
      'type-cast cast(str)',
    ]);
  });

  it('does not report an Any that another finding already covers, wherever it sits in a multi-line node', () => {
    const [actual, expected] = outcomes([
      [
        'multi-line pydantic field',
        {
          file: 'adapters/model.py',
          code: 'from typing import Any\nfrom pydantic import BaseModel\nclass Payload(BaseModel):\n    body: dict[\n        str,\n        Any,\n    ]\n',
        },
        ['pydantic-any-field:4 Payload.body'],
      ],
      [
        'multi-line domain annotation',
        {
          file: 'domain/total.py',
          code: 'from typing import Any\ndef total(\n    items: list[\n        Any\n    ],\n) -> int:\n    return 0\n',
        },
        ['any-in-domain:3 total'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves the implementation of an overloaded function to its overloads', () => {
    const [actual, expected] = outcomes([
      [
        'overload implementation',
        'from typing import Any, overload\n@overload\ndef f(a: int) -> int: ...\n@overload\ndef f(a: str) -> str: ...\ndef f(a: Any) -> Any:\n    return a\ndef g(a: Any) -> int:\n    return 0\n',
        ['explicit-any:8 g(a)'],
      ],
      [
        'overloaded method',
        'import typing\nclass C:\n    @typing.overload\n    def f(self, a: int) -> int: ...\n    @typing.overload\n    def f(self, a: str) -> str: ...\n    def f(self, a: typing.Any) -> typing.Any:\n        return a\n',
        [],
      ],
      [
        'getattr and callables stay flagged',
        'from collections.abc import Callable\nfrom typing import Any\ndef __getattr__(name: str) -> Any:\n    return name\nhandler: Callable[..., Any]\n',
        ['explicit-any:3 __getattr__(return)', 'explicit-any:5 handler'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('checks tests like source', () => {
    const [actual, expected] = outcomes([
      [
        'cast in a test',
        {
          file: 'tests/test_mod.py',
          code: 'from typing import Any, cast\ndef test_it(value: Any):\n    assert cast(str, value) == "a"\n',
        },
        ['explicit-any:2 test_it(value)', 'type-cast:3 cast(str) in test_it'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
