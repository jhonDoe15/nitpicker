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
    [
      'a for loop that only repeats the wait',
      'import time\nfor _ in range(10):\n    time.sleep(1)\n',
      ['fixed-sleep tests/test_mod.py:3 time.sleep'],
    ],
    [
      'a for loop that stops when the condition holds',
      'import time\nfor _ in range(50):\n    if ready():\n        break\n    time.sleep(0.1)\n',
      [],
    ],
    [
      'a retry loop that returns once the call succeeds',
      'import time\ndef test_a():\n    for _ in range(5):\n        try:\n            return call()\n        except OSError:\n            time.sleep(1)\n',
      [],
    ],
    [
      'a for loop whose only break belongs to an inner loop',
      'import time\nfor _ in range(3):\n    for item in items:\n        if item:\n            break\n    time.sleep(1)\n',
      ['fixed-sleep tests/test_mod.py:6 time.sleep'],
    ],
    [
      'an unconditional break',
      'import time\nfor _ in range(3):\n    time.sleep(1)\n    break\n',
      ['fixed-sleep tests/test_mod.py:3 time.sleep'],
    ],
    [
      'the else branch of a while loop',
      'import time\nwhile ready():\n    pass\nelse:\n    time.sleep(1)\n',
      ['fixed-sleep tests/test_mod.py:5 time.sleep'],
    ],
    [
      'a comprehension',
      'import time\n[time.sleep(1) for _ in range(3)]\n',
      ['fixed-sleep tests/test_mod.py:2 time.sleep'],
    ],
    [
      'a sleep from a star import',
      'from time import *\nsleep(5)\n',
      ['fixed-sleep tests/test_mod.py:2 time.sleep'],
    ],
    [
      'a helper that sleeps',
      'import time\ndef pause(seconds):\n    time.sleep(seconds)\n',
      ['fixed-sleep tests/test_mod.py:3 time.sleep'],
    ],
  ])('%s', (_name, code, expected) => {
    expect(sleeps(code)).toEqual(expected);
  });

  it.each([
    ['a with block that patches it', 'with mock.patch("time.sleep"):\n        time.sleep(5)'],
    [
      'a with block that patches the module attribute',
      'with mock.patch.object(time, "sleep"):\n        time.sleep(5)',
    ],
  ])('does not report a sleep under %s', (_name, body) => {
    const code = `import time\nfrom unittest import mock\ndef test_a():\n    ${body}\n`;
    expect(sleeps(code)).toEqual([]);
  });

  it('does not report a sleep in a test the patch decorates', () => {
    const code =
      'import time\nfrom unittest.mock import patch\n@patch("time.sleep")\ndef test_a(sleep):\n    time.sleep(5)\n';
    expect(sleeps(code)).toEqual([]);
  });

  it('reports a sleep after the patch ends, and a name the patch does not replace', () => {
    const code = [
      'import time',
      'from time import sleep',
      'from unittest import mock',
      'def test_a():',
      '    with mock.patch("time.sleep"):',
      '        sleep(5)',
      '    time.sleep(1)',
      '',
    ].join('\n');
    expect(sleeps(code)).toEqual([
      'fixed-sleep tests/test_mod.py:6 time.sleep',
      'fixed-sleep tests/test_mod.py:7 time.sleep',
    ]);
  });

  it('checks the code of a function defined in a loop as its own scope', () => {
    expect(sleeps('import time\nfor _ in x:\n    def f():\n        time.sleep(1)\n')).toEqual([
      'fixed-sleep tests/test_mod.py:4 time.sleep',
    ]);
  });

  it.each([
    'src/conftest.py',
    'test/helpers.py',
    'src/test_a.py',
    'testing/helpers.py',
    'shop/tests.py',
  ])('applies to %s', (file) => {
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
    ['a bullet list', ['One.', '', '- a', '- b', '  more b', '* c', '1. d', '2) e']],
    [
      'one-line sections',
      ['One.', 'Two.', 'Returns: x.', 'Raises ValueError: y.', 'Note: z.', 'more z.', 'and z.'],
    ],
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
      'fixed-sleep tests/test_mod.py:2 time.sleep',
    ]);
  });
});
