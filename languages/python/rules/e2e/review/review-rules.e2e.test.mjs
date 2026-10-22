import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf, reportOf, single } = createScripts();
afterEach(cleanup);

const only = (rule) => (findings) => findings.filter((finding) => finding.startsWith(`${rule} `));

describe.skipIf(!enabled)('singular-and-plural-field', () => {
  const pairs = (code) => only('singular-and-plural-field')(single(code));

  it.each([
    [
      'a dataclass',
      '@dataclass(frozen=True)\nclass Q:\n    tag: str | None = None\n    tags: list[str] | None = None\n',
      ['singular-and-plural-field src/mod.py:2 Q.tags'],
    ],
    [
      'a pydantic model with Sequence and Optional',
      'class Q(BaseModel):\n    box: Optional[Box] = None\n    boxes: Sequence[Box] = ()\n',
      ['singular-and-plural-field src/mod.py:1 Q.boxes'],
    ],
    [
      'a TypedDict with total=False and a variadic tuple',
      'class Q(TypedDict, total=False):\n    category: str\n    categories: tuple[str, ...]\n',
      ['singular-and-plural-field src/mod.py:1 Q.categories'],
    ],
    [
      'a TypedDict with NotRequired',
      'class Q(TypedDict):\n    tag: NotRequired[str]\n    tags: NotRequired[list[str]]\n',
      ['singular-and-plural-field src/mod.py:1 Q.tags'],
    ],
    [
      'keyword parameters',
      'def find(*, tag: str = "", tags: frozenset[str] = frozenset()) -> None: ...\n',
      ['singular-and-plural-field src/mod.py:1 find.tags'],
    ],
    [
      'irregular plurals',
      'def find(child: str = "", children: list[str] = (), person: str = "", people: list[str] = (), sub_index: int = 0, sub_indices: list[int] = ()) -> None: ...\n',
      [
        'singular-and-plural-field src/mod.py:1 find.children',
        'singular-and-plural-field src/mod.py:1 find.people',
        'singular-and-plural-field src/mod.py:1 find.sub_indices',
      ],
    ],
    [
      'string annotations',
      'def find(tag: "str | None" = None, tags: "list[str]" = ()) -> None: ...\n',
      ['singular-and-plural-field src/mod.py:1 find.tags'],
    ],
    [
      'required fields',
      '@dataclass(frozen=True)\nclass Q:\n    tag: str\n    tags: list[str]\n',
      [],
    ],
    ['a required TypedDict', 'class Q(TypedDict):\n    tag: str\n    tags: list[str]\n', []],
    ['different element types', 'def find(tag: str = "", tags: list[int] = ()) -> None: ...\n', []],
    ['a plain class', 'class Q:\n    tag: str = ""\n    tags: list[str] = []\n', []],
    ['unannotated parameters', 'def find(tag="", tags=()): ...\n', []],
    [
      'index and indexes, once',
      'def find(index: int = 0, indexes: list[int] = (), sub_index: int = 0, sub_indexes: list[int] = ()) -> None: ...\n',
      [
        'singular-and-plural-field src/mod.py:1 find.indexes',
        'singular-and-plural-field src/mod.py:1 find.sub_indexes',
      ],
    ],
    [
      'a pydantic field required through Field(...)',
      'class Q(BaseModel):\n    name: str = Field(..., description="x")\n    names: list[str] = Field(default_factory=list)\n',
      [],
    ],
    [
      'a pydantic field with a Field default',
      'class Q(BaseModel):\n    name: str = Field("", description="x")\n    names: list[str] = Field(default_factory=list)\n',
      ['singular-and-plural-field src/mod.py:1 Q.names'],
    ],
    [
      'a dataclass field with only metadata',
      '@dataclass\nclass Q:\n    tag: str = field(metadata={"a": 1})\n    tags: list[str] = field(default_factory=list)\n',
      [],
    ],
    [
      'attrs decorators',
      'import attr\nfrom attrs import frozen\n\n\n@attr.s(auto_attribs=True)\nclass Q:\n    tag: str = ""\n    tags: list[str] = attr.ib(factory=list)\n\n\n@frozen\nclass R:\n    tag: str = ""\n    tags: list[str] = ()\n',
      [
        'singular-and-plural-field src/mod.py:6 Q.tags',
        'singular-and-plural-field src/mod.py:12 R.tags',
      ],
    ],
    [
      'a decorator that only shares a name',
      'from shop.routes import define\n\n\n@define\nclass Q:\n    tag: str = ""\n    tags: list[str] = ()\n',
      [],
    ],
  ])('%s', (_name, code, expected) => {
    expect(pairs(code)).toEqual(expected);
  });

  it('checks a model whose base is a project model', () => {
    expect(
      findingsOf(
        {
          'src/shop/base.py':
            'from pydantic import BaseModel\n\n\nclass AppBase(BaseModel):\n    pass\n',
          'src/shop/query.py':
            'from shop.base import AppBase\n\n\nclass Q(AppBase):\n    tag: str = ""\n    tags: list[str] = []\n',
          'src/shop/totals.py':
            'from typing import TypedDict\n\n\nclass Base(TypedDict, total=False):\n    pass\n\n\nclass T(Base):\n    tag: str\n    tags: list[str]\n',
        },
        { sourceRoots: ['src'] },
      ).filter((finding) => finding.startsWith('singular-and-plural-field ')),
    ).toEqual(['singular-and-plural-field src/shop/query.py:4 Q.tags']);
  });

  it('names both fields and their kind', () => {
    const [entry] = reportOf({
      'src/mod.py': 'def find(tag: str = "", tags: list[str] = ()) -> None: ...\n',
    }).filter(({ rule }) => rule === 'singular-and-plural-field');

    expect(entry.data).toEqual({ singular: 'tag', plural: 'tags', kind: 'parameters' });
  });
});

describe.skipIf(!enabled)('rules that apply to several files at once', () => {
  it('see test files and production files in one run', () => {
    expect(
      findingsOf({
        'src/mod.py': 'def find(tag: str = "", tags: list[str] = ()) -> None: ...\n',
        'tests/test_mod.py': 'import time\ntime.sleep(1)\n',
      }),
    ).toEqual([
      'singular-and-plural-field src/mod.py:1 find.tags',
      'sleep-in-test tests/test_mod.py:2 time.sleep',
    ]);
  });
});
