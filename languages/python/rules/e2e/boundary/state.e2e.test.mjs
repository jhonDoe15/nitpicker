import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const inFile = (file, code) => ({ file, code });
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
