import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

describe.skipIf(process.env.NITPICKER_PYTHON_E2E !== '1')('Python type laundering', () => {
  it('checks quoted aliases and lambda defaults while leaving ordinary indexing alone', () => {
    const [actual, expected] = outcomes([
      [
        'quoted type alias',
        'from typing import TypeAlias, Any\nPayload: TypeAlias = "list[Any]"\n',
        ['explicit-any:2 typing.Any'],
      ],
      [
        'quoted generic alias',
        'from typing import Any\nPayload = list["Any"]\n',
        ['explicit-any:2 typing.Any'],
      ],
      ['shadowed container', 'from typing import Any\nlist = registry\nvalue = list["Any"]\n', []],
      [
        'lambda default',
        'from typing import cast\nname = lambda value=cast(str, source): value\n',
        ['type-cast:2 typing.cast'],
      ],
      [
        'cast in an annotation',
        'from typing import cast\ndef name(value: cast(type, str)):\n    return value\n',
        ['type-cast:2 name.typing.cast'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('resolves typing imports without confusing unrelated or shadowed names', () => {
    const [actual, expected] = outcomes([
      ['cast', 'import typing\nvalue = typing.cast(str, source)\n', ['type-cast:2 typing.cast']],
      [
        'renamed cast',
        'from typing import cast as convert\nvalue = convert(str, source)\n',
        ['type-cast:2 typing.cast'],
      ],
      [
        'extensions',
        'import typing_extensions as t\nvalue: t.Any\n',
        ['explicit-any:2 typing_extensions.Any'],
      ],
      [
        'nested annotations',
        'from typing import Any as Dynamic\ndef name(value: list[Dynamic]) -> Dynamic:\n    return value\n',
        ['explicit-any:2 name.typing.Any', 'explicit-any:2 name.typing.Any'],
      ],
      [
        'quoted annotation',
        'import typing as t\nvalue: "list[t.Any]"\n',
        ['explicit-any:2 typing.Any'],
      ],
      [
        'nested forward reference',
        'from typing import Any\nvalue: list["Any"] | None\n',
        ['explicit-any:2 typing.Any'],
      ],
      [
        'alias declaration',
        'from typing import Any\nDynamic = Any\n',
        ['explicit-any:2 typing.Any'],
      ],
      [
        'local import',
        'def name(value):\n    from typing import cast\n    return cast(str, value)\n',
        ['type-cast:3 name.typing.cast'],
      ],
      [
        'cast with an explicit Any is one finding',
        'from typing import Any, cast\nvalue = cast(Any, source)\nother = cast(list[Any], source)\n',
        ['type-cast:2 typing.cast', 'type-cast:3 typing.cast'],
      ],
      [
        'wrapper typed with ParamSpec and object',
        'from collections.abc import Callable\nfrom typing import ParamSpec, TypeVar\nP = ParamSpec("P")\nR = TypeVar("R")\ndef wrap(call: Callable[P, R]) -> Callable[P, R]:\n    def inner(*args: P.args, **kwargs: P.kwargs) -> R:\n        return call(*args, **kwargs)\n    return inner\nPayload = dict[str, object]\n',
        [],
      ],
      [
        'wrapper with Any arguments',
        'from typing import Any\ndef wrap(call):\n    def inner(*args: Any, **kwargs: Any):\n        return call(*args, **kwargs)\n    return inner\n',
        ['explicit-any:3 wrap.inner.typing.Any', 'explicit-any:3 wrap.inner.typing.Any'],
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
        ['type-cast:5 Names.name.typing.cast'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
