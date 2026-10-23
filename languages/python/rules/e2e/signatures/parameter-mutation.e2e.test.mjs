import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });
const body = (lines) => `def f(p: ${lines.type}) -> None:\n    ${lines.use}\n`;

describe.skipIf(!enabled)('parameter-mutation', () => {
  it.each([
    ['list', 'p.append(1)', 'p.append'],
    ['list', 'p.extend([1])', 'p.extend'],
    ['list', 'p.insert(0, 1)', 'p.insert'],
    ['list', 'p.remove(1)', 'p.remove'],
    ['list', 'p.pop()', 'p.pop'],
    ['list', 'p.clear()', 'p.clear'],
    ['list', 'p.sort()', 'p.sort'],
    ['list', 'p.reverse()', 'p.reverse'],
    ['list', 'p[0] = 1', 'p[...]'],
    ['list', 'p[1:2] = [3]', 'p[...]'],
    ['list', 'del p[0]', 'p[...]'],
    ['list', 'p += [1]', 'p +='],
    ['dict', 'p.update({"a": 1})', 'p.update'],
    ['dict', 'p.setdefault("a", 1)', 'p.setdefault'],
    ['dict', 'p.popitem()', 'p.popitem'],
    ['dict', 'p["a"] = 1', 'p[...]'],
    ['dict', 'p["a"]["b"] = 1', 'p[...]'],
    ['dict', 'p["a"] += 1', 'p[...]'],
    ['dict', 'p |= {"a": 1}', 'p |='],
    ['set', 'p.add(1)', 'p.add'],
    ['set', 'p.discard(1)', 'p.discard'],
    ['set', 'p.difference_update({1})', 'p.difference_update'],
    ['set', 'p |= {1}', 'p |='],
    ['set', 'p -= {1}', 'p -='],
    ['deque', 'p.appendleft(1)', 'p.appendleft'],
    ['bytearray', 'p.extend(b"a")', 'p.extend'],
    ['list', 'random.shuffle(p)', 'random.shuffle(p)'],
    ['list', 'heapq.heappush(p, 1)', 'heapq.heappush(p)'],
    ['list', 'bisect.insort(p, 1)', 'bisect.insort(p)'],
  ])('flags %s: %s', (type, use, label) => {
    const imports =
      'import bisect\nimport heapq\nimport random\nfrom collections import deque\n\n\n';
    const code = `${imports}${body({ type: type === 'deque' ? 'deque[int]' : `${type}`, use })}`;
    const [actual, expected] = outcomes([[use, code, [`parameter-mutation:8 ${label} (f)`]]]);
    expect(actual).toEqual(expected);
  });

  it('names the parameter, the function and the line of each different mutation', () => {
    const [actual, expected] = outcomes([
      [
        'several mutations',
        'def collect(names: list[str], seen: set[str]) -> None:\n    names.append("a")\n    names.append("b")\n    names.sort()\n    seen.add("a")\n',
        [
          'parameter-mutation:2 names.append (collect)',
          'parameter-mutation:4 names.sort (collect)',
          'parameter-mutation:5 seen.add (collect)',
        ],
      ],
      [
        'a method and a constructor',
        'class Bag:\n    def __init__(self, items: list[int]) -> None:\n        items.append(0)\n\n    def fill(self, items: list[int]) -> None:\n        items.extend([1])\n',
        [
          'parameter-mutation:3 items.append (Bag.__init__)',
          'parameter-mutation:6 items.extend (Bag.fill)',
        ],
      ],
      [
        'typing aliases and optionals',
        'from typing import Dict, List, MutableMapping, Optional\n\n\ndef f(a: List[int], b: Dict[str, int], c: MutableMapping[str, int], d: Optional[list[int]]) -> None:\n    a.append(1)\n    b["x"] = 1\n    c.update({})\n    d.append(1)\n',
        [
          'parameter-mutation:5 a.append (f)',
          'parameter-mutation:6 b[...] (f)',
          'parameter-mutation:7 c.update (f)',
          'parameter-mutation:8 d.append (f)',
        ],
      ],
      [
        'a string annotation',
        'def f(a: "list[int]") -> None:\n    a.append(1)\n',
        ['parameter-mutation:2 a.append (f)'],
      ],
      [
        'a keyword-only parameter and a nested function',
        'def outer(*, items: list[int]) -> None:\n    def inner() -> None:\n        items.append(1)\n\n    inner()\n',
        ['parameter-mutation:3 items.append (outer)'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves copies, locals, read-only use and other types alone', () => {
    const [actual, expected] = outcomes([
      [
        'a copy made first',
        'def f(a: list[int]) -> list[int]:\n    a = list(a)\n    a.append(1)\n    return a\n',
        [],
      ],
      [
        'a copy through unpacking, a comprehension and a loop target',
        'def f(a: dict[str, int], b: set[int]) -> None:\n    a = {**a}\n    a["x"] = 1\n    b = {i for i in b}\n    b.add(1)\n',
        [],
      ],
      [
        'reading and building a new value',
        'def f(a: list[int], b: dict[str, int]) -> list[int]:\n    total = sorted(a)\n    c = b.get("x")\n    d = a + [1]\n    return [*total, *d, c or 0]\n',
        [],
      ],
      [
        'a local list',
        'def f(a: list[int]) -> list[int]:\n    out: list[int] = []\n    out.extend(a)\n    out.sort()\n    return out\n',
        [],
      ],
      [
        'self and other types',
        'class Box:\n    def put(self, item: int, name: str, session: Session) -> None:\n        self.items.append(item)\n        session.add(item)\n        name += "x"\n',
        [],
      ],
      [
        'read-only protocols',
        'from collections.abc import Mapping, Sequence\n\n\ndef f(a: Sequence[int], b: Mapping[str, int]) -> int:\n    return len(a) + len(b)\n',
        [],
      ],
      ['an unannotated parameter', 'def f(a):\n    a.append(1)\n', []],
      [
        'a test file',
        inFile('tests/test_mod.py', 'def fill(a: list[int]) -> None:\n    a.append(1)\n'),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
