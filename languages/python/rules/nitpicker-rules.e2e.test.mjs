import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Runs the rules script (nitpicker_rules.py) with the python3 on the PATH, so it only runs with
// NITPICKER_PYTHON_E2E=1 (`npm run test:python`).

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const script = path.join(import.meta.dirname, 'nitpicker_rules.py');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function findingsOf(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-rules-script-')));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  writeFileSync(path.join(root, 'files.txt'), Object.keys(files).join('\n'));
  const result = spawnSync('python3', ['-I', script, 'files.txt', 'out.json'], {
    cwd: root,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(readFileSync(path.join(root, 'out.json'), 'utf8')).map(
    ({ rule, path: file, subject, line }) => `${rule} ${file}:${String(line)} ${subject}`,
  );
}

const single = (code, file = 'src/mod.py') => findingsOf({ [file]: code });

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
    'tests/test_orders.py',
    'test/helpers.py',
    'src/test_orders.py',
    'src/orders_test.py',
    'src/conftest.py',
  ])('does not apply to the test file %s', (file) => {
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
      'three module constants with one prefix',
      'STATUS_A = "a"\nSTATUS_B = "b"\nSTATUS_C: str = "c"\n',
      ['enum-string-constants src/mod.py:1 STATUS_*'],
    ],
    ['two module constants with one prefix', 'STATUS_A = "a"\nSTATUS_B = "b"\n', []],
    ['module constants of different prefixes', 'A_X = "a"\nB_X = "b"\nC_X = "c"\n', []],
    ['module constants without a prefix', 'ALPHA = "a"\nBETA = "b"\nGAMMA = "c"\n', []],
    ['non-string module constants', 'STATUS_A = 1\nSTATUS_B = 2\nSTATUS_C = 3\n', []],
  ])('%s', (_name, code, expected) => {
    expect(single(code)).toEqual(expected);
  });

  it('reports each prefix group once, at its first constant', () => {
    const code = 'B_1 = "x"\nA_1 = "x"\nB_2 = "x"\nA_2 = "x"\nB_3 = "x"\nA_3 = "x"\n';

    expect(single(code)).toEqual([
      'enum-string-constants src/mod.py:1 B_*',
      'enum-string-constants src/mod.py:2 A_*',
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
  ])('bans %s', (code, subject) => {
    expect(single(`${code}\n`)).toEqual([`no-inline-suppression src/mod.py:1 ${subject}`]);
  });

  it.each([
    '# pyright: strict',
    '# mypy: strict',
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
