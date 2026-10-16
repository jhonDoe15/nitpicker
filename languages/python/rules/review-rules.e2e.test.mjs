import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from './test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf, reportOf, single } = createScripts();
afterEach(cleanup);

const TEST_FILE = 'tests/test_mod.py';
const only = (rule) => (findings) => findings.filter((finding) => finding.startsWith(`${rule} `));

describe.skipIf(!enabled)('fixed-sleep', () => {
  const sleeps = (code, file = TEST_FILE) => only('fixed-sleep')(single(code, file));

  it.each([
    ['time.sleep', 'import time\ntime.sleep(1)\n', ['fixed-sleep tests/test_mod.py:2 time.sleep']],
    [
      'an imported sleep',
      'from time import sleep\nsleep(0.5)\n',
      ['fixed-sleep tests/test_mod.py:2 time.sleep'],
    ],
    [
      'an awaited asyncio.sleep',
      'import asyncio\nasync def test_a():\n    await asyncio.sleep(0.1)\n',
      ['fixed-sleep tests/test_mod.py:3 asyncio.sleep'],
    ],
    [
      'a delay passed by keyword',
      'import trio\ntrio.sleep(seconds=2)\n',
      ['fixed-sleep tests/test_mod.py:2 trio.sleep'],
    ],
    [
      'Playwright wait_for_timeout, also in a loop',
      'def test_a(page):\n    for _ in range(3):\n        page.wait_for_timeout(500)\n',
      ['fixed-sleep tests/test_mod.py:3 wait_for_timeout'],
    ],
    ['a zero sleep that only yields', 'import asyncio\nasyncio.sleep(0)\n', []],
    ['a sleep inside a polling loop', 'import time\nwhile not done():\n    time.sleep(0.05)\n', []],
    ['another sleep function', 'import mylib\nmylib.sleep(1)\n', []],
  ])('%s', (_name, code, expected) => {
    expect(sleeps(code)).toEqual(expected);
  });

  it('checks the code of a function defined in a loop as its own scope', () => {
    expect(sleeps('import time\nfor _ in x:\n    def f():\n        time.sleep(1)\n')).toEqual([
      'fixed-sleep tests/test_mod.py:4 time.sleep',
    ]);
  });

  it.each(['src/conftest.py', 'test/helpers.py', 'src/test_a.py'])('applies to %s', (file) => {
    expect(sleeps('import time\ntime.sleep(1)\n', file)).toHaveLength(1);
  });

  it('does not apply to production code', () => {
    expect(sleeps('import time\ntime.sleep(1)\n', 'src/mod.py')).toEqual([]);
  });
});

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
  ])('does not count %s', (_name, lines) => {
    expect(long(docstring(lines))).toEqual([]);
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
      'fixed-sleep tests/test_mod.py:2 time.sleep',
    ]);
  });
});
