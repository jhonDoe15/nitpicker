import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf, reportOf, single } = createScripts();
afterEach(cleanup);

const only = (rule) => (findings) => findings.filter((finding) => finding.startsWith(`${rule} `));

describe.skipIf(!enabled)('restating-docstring', () => {
  const restating = (code) => only('restating-docstring')(single(code));

  it.each([
    ['a function', 'def load_user():\n    """Load the user."""\n', ['load_user']],
    [
      'stopwords and stems',
      'def load_users():\n    """Returns the loaded user."""\n',
      ['load_users'],
    ],
    ['a class', 'class OrderRepository:\n    """Repository of orders."""\n', ['OrderRepository']],
    [
      'a method, by its scope',
      'class A:\n    def total_price(self):\n        """The total price."""\n',
      ['A.total_price'],
    ],
    [
      'a docstring that adds a fact',
      'def load_user():\n    """Raises KeyError for an unknown id."""\n',
      [],
    ],
    ['a module docstring', '"""Users."""\n', []],
    [
      'an Args section that says more',
      'def get_user(user_id):\n    """Get the user.\n\n    Args:\n        user_id: Database key, not the login.\n    """\n',
      [],
    ],
    [
      'a one-line Returns section',
      'def get_user():\n    """Get the user.\n\n    Returns: The login name.\n    """\n',
      [],
    ],
    [
      'a bullet list that says more',
      'def get_user():\n    """Get the user.\n\n    - from the cache first\n    """\n',
      [],
    ],
    [
      'empty sections',
      'def get_user(user_id):\n    """Get the user.\n\n    :param user_id:\n    :returns:\n    """\n',
      ['get_user'],
    ],
  ])('%s', (_name, code, subjects) => {
    expect(restating(code).map((finding) => finding.split(' ').at(-1))).toEqual(subjects);
  });

  it('reports at the docstring line', () => {
    expect(restating('def load_user():\n\n    """Load the user."""\n')).toEqual([
      'restating-docstring src/mod.py:3 load_user',
    ]);
  });
});

describe.skipIf(!enabled)('long-docstring', () => {
  const docstring = (lines) => `def render():\n    """${lines.join('\n    ')}\n    """\n`;
  const long = (code) =>
    reportOf({ 'src/mod.py': code }).filter(({ rule }) => rule === 'long-docstring');

  it('reports more than 5 description lines with the count', () => {
    expect(long(docstring(['One.', 'Two.', 'Three.', '', 'Four.', 'Five.', 'Six.']))).toEqual([
      {
        rule: 'long-docstring',
        path: 'src/mod.py',
        subject: 'render',
        line: 2,
        data: { lines: 6, limit: 5 },
      },
    ]);
  });

  it.each([
    ['5 lines', ['One.', 'Two.', 'Three.', 'Four.', 'Five.']],
    [
      'Google sections',
      ['One.', 'Two.', '', 'Args:', '    a: x.', '    b: y.', '    c: z.', 'Returns:', '    w.'],
    ],
    [
      ':param fields',
      ['One.', ':param a: x.', ':param b: y.', ':param c: z.', ':returns: w.', ':raises E: v.'],
    ],
    [
      'numpy sections',
      ['One.', '', 'Parameters', '----------', 'a : int', '    x.', 'b : int', '    y.'],
    ],
    ['doctest examples', ['One.', '>>> render()', "''", '>>> render()', "''", '>>> 1', '1']],
    [
      'a literal block',
      ['One.', 'Example::', '', '    a = 1', '    b = 2', '    c = 3', '    d = 4', '    e = 5'],
    ],
    [
      'a code-block directive',
      [
        'One.',
        '',
        '.. code-block:: python',
        '',
        '    a = 1',
        '    b = 2',
        '    c = 3',
        '    d = 4',
      ],
    ],
    [
      'a fenced block',
      ['One.', '', '```', 'a = 1', 'b = 2', 'c = 3', 'd = 4', 'e = 5', '```', 'Two.'],
    ],
    [
      'one-line sections',
      ['One.', 'Two.', 'Returns: x.', 'Raises ValueError: y.', 'Note: z.', 'more z.', 'and z.'],
    ],
  ])('does not count %s', (_name, lines) => {
    expect(long(docstring(lines))).toEqual([]);
  });

  it.each([
    ['a bullet list', ['One.', '', '- a', '- b', '  more b', '* c', '1. d', '2) e'], 7],
    ['a note directive', ['One.', '', '.. note::', '', '    a', '    b', '    c', '    d'], 6],
    [
      'prose after a doctest',
      ['One.', '>>> render()', "''", '', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.'],
      6,
    ],
  ])('counts %s', (_name, lines, count) => {
    expect(long(docstring(lines)).map(({ data }) => data.lines)).toEqual([count]);
  });
});

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
  ])('%s', (_name, code, expected) => {
    expect(pairs(code)).toEqual(expected);
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
        'src/mod.py': 'def load_user():\n    """Load the user."""\n',
        'tests/test_mod.py': 'import time\ntime.sleep(1)\n',
      }),
    ).toEqual([
      'restating-docstring src/mod.py:2 load_user',
      'sleep-in-test tests/test_mod.py:2 time.sleep',
    ]);
  });
});
