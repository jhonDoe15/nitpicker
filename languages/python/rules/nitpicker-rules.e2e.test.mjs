import { afterEach, describe, expect, it } from 'vitest';
import { TEST_DIRECTORIES, testFileGlobs } from '../adapters/execution/python-test-files.mjs';
import { createScripts } from './test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf, single } = createScripts();
afterEach(cleanup);

describe.skipIf(!enabled)('frozen-dataclass', () => {
  it.each([
    ['@dataclass', '@dataclass\nclass A:\n    x: int\n', ['frozen-dataclass src/mod.py:2 A']],
    ['@dataclass()', '@dataclass()\nclass A:\n    x: int\n', ['frozen-dataclass src/mod.py:2 A']],
    [
      'dataclasses.dataclass(frozen=False)',
      '@dataclasses.dataclass(frozen=False)\nclass A:\n    x: int\n',
      ['frozen-dataclass src/mod.py:2 A'],
    ],
    [
      'frozen from a variable',
      '@dataclass(frozen=FROZEN)\nclass A:\n    x: int\n',
      ['frozen-dataclass src/mod.py:2 A'],
    ],
    ['frozen=True', '@dataclass(frozen=True, slots=True)\nclass A:\n    x: int\n', []],
    ['dotted frozen=True', '@dataclasses.dataclass(frozen=True)\nclass A:\n    x: int\n', []],
    ['another decorator', '@total_ordering\nclass A:\n    x: int\n', []],
    ['a call to another decorator', '@register(1)\nclass A:\n    x: int\n', []],
    ['an attribute of a call', '@a().b\nclass A:\n    x: int\n', []],
  ])('%s', (_name, code, expected) => {
    expect(single(code)).toEqual(expected);
  });

  it('names a nested class by its scope', () => {
    expect(single('class Outer:\n    @dataclass\n    class Inner:\n        x: int\n')).toEqual([
      'frozen-dataclass src/mod.py:3 Outer.Inner',
    ]);
    expect(single('def build():\n    @dataclass\n    class Local:\n        x: int\n')).toEqual([
      'frozen-dataclass src/mod.py:3 build.Local',
    ]);
  });

  it.each([
    ...TEST_DIRECTORIES.flatMap((directory) => [
      `${directory}/helpers.py`,
      `src/${directory}/a.py`,
    ]),
    ...testFileGlobs(false)
      .flatMap((glob) => [glob, `src/polls/${glob}`])
      .map((file) => file.replace('*', 'orders')),
  ])('does not apply to %s, a test file of the shared test file list', (file) => {
    expect(single('@dataclass\nclass A:\n    x: int\n', file)).toEqual([]);
  });

  it('applies to a file that only looks like a test', () => {
    expect(single('@dataclass\nclass A:\n    x: int\n', 'src/latest.py')).toEqual([
      'frozen-dataclass src/latest.py:2 A',
    ]);
  });
});

describe.skipIf(!enabled)('pydantic-boundary', () => {
  it.each([
    ['import pydantic', ['pydantic-boundary src/mod.py:1 pydantic']],
    ['import pydantic.v1 as v1', ['pydantic-boundary src/mod.py:1 pydantic.v1']],
    ['from pydantic import BaseModel', ['pydantic-boundary src/mod.py:1 pydantic']],
    [
      'from pydantic.dataclasses import dataclass',
      ['pydantic-boundary src/mod.py:1 pydantic.dataclasses'],
    ],
    [
      'from pydantic_settings import BaseSettings',
      ['pydantic-boundary src/mod.py:1 pydantic_settings'],
    ],
    ['def load():\n    import pydantic\n', ['pydantic-boundary src/mod.py:2 pydantic']],
    ['import pydanticish', []],
    ['from . import pydantic', []],
    ['from .pydantic import Model', []],
    ['import os, json', []],
  ])('%s', (code, expected) => {
    expect(single(`${code}\n`)).toEqual(expected);
  });

  it.each(['src/app/adapters/api.py', 'adapters/api.py', 'tests/test_api.py'])(
    'allows %s',
    (file) => {
      expect(single('from pydantic import BaseModel\n', file)).toEqual([]);
    },
  );

  it('does not treat a file named adapters.py as the boundary', () => {
    expect(single('from pydantic import BaseModel\n', 'src/adapters.py')).toEqual([
      'pydantic-boundary src/adapters.py:1 pydantic',
    ]);
  });
});

describe.skipIf(!enabled)('enum-string-constants', () => {
  it.each([
    [
      'a plain class of two string constants',
      'class Color:\n    RED = "red"\n    BLUE = "blue"\n',
      ['enum-string-constants src/mod.py:1 Color'],
    ],
    [
      'annotated constants and an object base',
      'class Color(object):\n    RED: str = "red"\n    BLUE: Final = "blue"\n',
      ['enum-string-constants src/mod.py:1 Color'],
    ],
    ['one string constant', 'class Color:\n    RED = "red"\n', []],
    ['a class with a base', 'class Color(Base):\n    RED = "red"\n    BLUE = "blue"\n', []],
    ['an Enum', 'class Color(Enum):\n    RED = "red"\n    BLUE = "blue"\n', []],
    ['a decorated class', '@final\nclass Color:\n    RED = "red"\n    BLUE = "blue"\n', []],
    [
      'a class with keywords',
      'class Color(metaclass=Meta):\n    RED = "red"\n    BLUE = "blue"\n',
      [],
    ],
    ['numbers', 'class Limits:\n    LOW = 1\n    HIGH = 2\n', []],
    ['lower case names', 'class Color:\n    red = "red"\n    blue = "blue"\n', []],
    ['chained assignment', 'class Color:\n    RED = BLUE = "x"\n    GREEN = "g"\n', []],
    ['an attribute target', 'class Color:\n    self.RED = "r"\n    self.BLUE = "b"\n', []],
    [
      'three module constants whose values are their names after one prefix',
      'STATUS_A = "a"\nSTATUS_B = "b"\nSTATUS_C: str = "c"\n',
      ['enum-string-constants src/mod.py:1 STATUS_*'],
    ],
    [
      'values spelled with hyphens and other case',
      'STATUS_IN_PROGRESS = "in-progress"\nSTATUS_DONE = "Done"\nSTATUS_NEW = "new"\n',
      ['enum-string-constants src/mod.py:1 STATUS_*'],
    ],
    [
      'class constants with a shared prefix',
      'class Color:\n    COLOR_RED = "red"\n    COLOR_BLUE = "blue"\n',
      ['enum-string-constants src/mod.py:1 Color'],
    ],
    [
      'class constants whose values are their whole names',
      'class Color:\n    COLOR_RED = "color_red"\n    COLOR_BLUE = "COLOR_BLUE"\n',
      ['enum-string-constants src/mod.py:1 Color'],
    ],
    ['two module constants with one prefix', 'STATUS_A = "a"\nSTATUS_B = "b"\n', []],
    ['module constants of different prefixes', 'A_X = "x"\nB_X = "x"\nC_X = "x"\n', []],
    ['module constants without a prefix', 'ALPHA = "a"\nBETA = "b"\nGAMMA = "c"\n', []],
    ['non-string module constants', 'STATUS_A = 1\nSTATUS_B = 2\nSTATUS_C = 3\n', []],
    [
      'configuration constants of a module',
      'DB_HOST = "localhost"\nDB_USER = "app"\nDB_NAME = "shop"\nAPI_URL = "https://x"\nAPI_KEY_HEADER = "X-Key"\nAPI_VERSION = "v1"\n',
      [],
    ],
    [
      'configuration constants of a class',
      'class Defaults:\n    HOST = "localhost"\n    PORT_NAME = "http"\n',
      [],
    ],
    [
      'a Final configuration class',
      'class Defaults:\n    HOST: Final = "localhost"\n    MODE: Final = "fast"\n',
      [],
    ],
    [
      'a group where one constant is not its name',
      'STATUS_A = "a"\nSTATUS_B = "b"\nSTATUS_C = "other"\n',
      [],
    ],
  ])('%s', (_name, code, expected) => {
    expect(single(code)).toEqual(expected);
  });

  it('reports each prefix group once, at its first constant', () => {
    const code = 'B_1 = "1"\nA_1 = "1"\nB_2 = "2"\nA_2 = "2"\nB_3 = "3"\nA_3 = "3"\n';

    expect(single(code)).toEqual([
      'enum-string-constants src/mod.py:1 B_*',
      'enum-string-constants src/mod.py:2 A_*',
    ]);
  });
});

describe.skipIf(!enabled)('type checking bypasses', () => {
  it.each([
    ['@no_type_check', '@no_type_check\ndef f(a):\n    pass\n', ['no-type-check src/mod.py:2 f']],
    [
      '@typing.no_type_check',
      'import typing\n\n\n@typing.no_type_check\nasync def f(a):\n    pass\n',
      ['no-type-check src/mod.py:5 f'],
    ],
    [
      'an aliased import',
      'from typing import no_type_check as skip\n\n\n@skip\ndef f(a):\n    pass\n',
      ['no-type-check src/mod.py:5 f'],
    ],
    [
      'an aliased module',
      'import typing as t\n\n\n@t.no_type_check\nclass K:\n    pass\n',
      ['no-type-check src/mod.py:5 K'],
    ],
    [
      'a method',
      'class K:\n    @no_type_check\n    def m(self):\n        pass\n',
      ['no-type-check src/mod.py:3 K.m'],
    ],
    ['another decorator', '@cache\ndef f(a):\n    pass\n', []],
    [
      'if not TYPE_CHECKING',
      'from typing import TYPE_CHECKING\n\nif not TYPE_CHECKING:\n    x = 1\n',
      ['not-type-checking src/mod.py:3 if not TYPE_CHECKING'],
    ],
    [
      'if not typing.TYPE_CHECKING',
      'import typing\n\nif not typing.TYPE_CHECKING:\n    x = 1\n',
      ['not-type-checking src/mod.py:3 if not TYPE_CHECKING'],
    ],
    [
      'an aliased TYPE_CHECKING inside a condition',
      'from typing import TYPE_CHECKING as TC\n\nif not TC and x:\n    y = 1\n',
      ['not-type-checking src/mod.py:3 if not TYPE_CHECKING'],
    ],
    [
      'if TYPE_CHECKING',
      'from typing import TYPE_CHECKING\n\nif TYPE_CHECKING:\n    import os\n',
      [],
    ],
    ['an unrelated condition', 'if not DEBUG:\n    x = 1\n', []],
  ])('%s', (_name, code, expected) => {
    expect(single(code)).toEqual(expected);
  });

  it('flags a stub beside its source, and only a stub of the same stem', () => {
    expect(findingsOf({ 'src/a.py': 'x = 1\n', 'src/a.pyi': 'x: int\n' })).toEqual([
      'stub-beside-source src/a.py:1 a.pyi',
    ]);
    expect(findingsOf({ 'src/a.py': 'x = 1\n', 'src/b.pyi': 'x: int\n' })).toEqual([]);
    expect(findingsOf({ 'src/a.py': 'x = (\n', 'src/a.pyi': 'x: int\n' })).toEqual([
      'stub-beside-source src/a.py:1 a.pyi',
    ]);
  });
});

describe.skipIf(!enabled)('frozen-dataclass aliases', () => {
  it('sees through an aliased dataclass import', () => {
    expect(
      single('from dataclasses import dataclass as dc\n\n\n@dc\nclass A:\n    x: int\n'),
    ).toEqual(['frozen-dataclass src/mod.py:5 A']);
    expect(
      single(
        'from dataclasses import dataclass as dc\n\n\n@dc(frozen=True)\nclass A:\n    x: int\n',
      ),
    ).toEqual([]);
    expect(single('import dataclasses as d\n\n\n@d.dataclass\nclass A:\n    x: int\n')).toEqual([
      'frozen-dataclass src/mod.py:5 A',
    ]);
  });
});

describe.skipIf(!enabled)('no-inline-suppression', () => {
  it.each([
    ['x = 1  # type: ignore', 'type: ignore'],
    ['x = 1  # type: ignore[arg-type]', 'type: ignore[arg-type]'],
    ['x = 1  #type:ignore', 'type:ignore'],
    ['import os  # noqa', 'noqa'],
    ['import os  # NOQA: F401', 'NOQA: F401'],
    ['import os  # explanation # noqa: F401', 'explanation # noqa: F401'],
    ['# ruff: noqa', 'ruff: noqa'],
    ['# flake8: noqa', 'flake8: noqa'],
    ['x = 1  # pyright: ignore', 'pyright: ignore'],
    ['x = 1  # pyright: ignore[reportX]', 'pyright: ignore[reportX]'],
    ['# pyright: basic', 'pyright: basic'],
    ['# pyright: standard', 'pyright: standard'],
    ['# pyright: reportMissingImports=false', 'pyright: reportMissingImports=false'],
    ['# pyright: reportMissingImports = none', 'pyright: reportMissingImports = none'],
    ['# mypy: ignore-errors', 'mypy: ignore-errors'],
    ['# mypy: disallow-untyped-defs=False', 'mypy: disallow-untyped-defs=False'],
    ['# fmt: off', 'fmt: off'],
    ['x = [1,2]  # fmt: skip', 'fmt: skip'],
    ['# fmt:off', 'fmt:off'],
  ])('bans %s', (code, subject) => {
    expect(single(`${code}\n`)).toEqual([`no-inline-suppression src/mod.py:1 ${subject}`]);
  });

  it.each([
    '# pyright: strict',
    '# mypy: strict',
    '# fmt: on',
    '# a note about noqa-less code',
    '# nothing here',
    'x = "# type: ignore"',
    'x = "# noqa"',
    '# type: int',
    '# pyright: reportMissingImports=true',
  ])('allows %s', (code) => {
    expect(single(`${code}\n`)).toEqual([]);
  });

  it('reports the comment on its own line when it is the only one', () => {
    expect(single('x = 1\n\n\ny = 2  # type: ignore\n')).toEqual([
      'no-inline-suppression src/mod.py:4 type: ignore',
    ]);
  });
});

describe.skipIf(!enabled)('files', () => {
  it('skips a file that does not parse and a file that is missing', () => {
    expect(
      findingsOf({
        'src/broken.py': 'def (:\n',
        'src/ok.py': 'x = 1  # noqa\n',
      }),
    ).toEqual(['no-inline-suppression src/ok.py:1 noqa']);
  });

  it('skips a file with an unreadable encoding', () => {
    expect(findingsOf({ 'src/bad.py': '# coding: nonsense\nx = 1  # noqa\n' })).toEqual([]);
  });

  it('skips a file whose code does not parse even though it has comments', () => {
    expect(findingsOf({ 'src/open.py': 'x = (1,\n  # noqa\n' })).toEqual([]);
  });

  it('orders findings by path, then line, then rule', () => {
    expect(
      findingsOf({
        'b.py': 'x = 1  # noqa\n',
        'a.py': '@dataclass\nclass A:\n    x: int  # noqa\n',
      }),
    ).toEqual([
      'frozen-dataclass a.py:2 A',
      'no-inline-suppression a.py:3 noqa',
      'no-inline-suppression b.py:1 noqa',
    ]);
  });

  it('reads an empty list', () => {
    expect(findingsOf({})).toEqual([]);
  });
});
