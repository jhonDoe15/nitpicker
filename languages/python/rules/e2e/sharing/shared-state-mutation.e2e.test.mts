import { describe } from 'vitest';
import { useRuleScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useRuleScripts('shared-state-mutation', { enabled });

const CONFIG = [
  'DEFAULTS = {"a": 1}',
  'NAMES = ["x"]',
  'FROZEN = ("a",)',
  '',
  '',
  'class Config:',
  '    def __init__(self, data):',
  '        self.data = data',
  '        self.data["seen"] = 1',
  '',
  '',
  'class Store:',
  '    def __init__(self, items=None):',
  '        self.items = items',
  '',
  '    def add(self, item):',
  '        self.items.append(item)',
  '',
  '',
  'class Plain:',
  '    def __init__(self, data):',
  '        self.data = dict(data)',
  '        self.data["k"] = 1',
  '',
  '',
];

describe.skipIf(!enabled)('shared-state-mutation', () => {
  itOutcomes('reports a module-level collection handed to a class that changes it', [
    [
      'a positional and a keyword argument',
      code(...CONFIG, 'first = Config(DEFAULTS)', 'second = Config(data=DEFAULTS)'),
      [
        'shared-state-mutation:26 DEFAULTS in Config',
        'shared-state-mutation:27 DEFAULTS in Config',
      ],
    ],
    [
      'a list stored by the receiver and changed in a method',
      code(...CONFIG, 'store = Store(NAMES)'),
      ['shared-state-mutation:26 NAMES in Store'],
    ],
    [
      'a collection stored on self and changed by the same class',
      code(
        'NAMES = ["x"]',
        '',
        '',
        'class Holder:',
        '    def __init__(self):',
        '        self.shared = NAMES',
        '',
        '    def put(self):',
        '        self.shared.append(1)',
      ),
      ['shared-state-mutation:6 NAMES in Holder'],
    ],
    [
      'a dataclass field that a method changes',
      code(
        'from dataclasses import dataclass',
        '',
        'TAGS = {"a"}',
        '',
        '',
        '@dataclass',
        'class Post:',
        '    tags: set',
        '',
        '    def tag(self):',
        '        self.tags.add("b")',
        '',
        '',
        'post = Post(TAGS)',
      ),
      ['shared-state-mutation:14 TAGS in Post'],
    ],
    [
      'a constant imported from another module',
      {
        files: {
          'defaults.py': 'DEFAULTS = {"a": 1}\n',
          'config.py':
            'class Config:\n    def __init__(self, data):\n        self.data = data\n\n    def touch(self):\n        self.data["t"] = 1\n',
          'mod.py':
            'from .defaults import DEFAULTS\nfrom .config import Config\n\nitem = Config(DEFAULTS)\n',
        },
      },
      ['shared-state-mutation:4 DEFAULTS in Config'],
    ],
  ]);

  itOutcomes('leaves copies, immutable values and receivers that only read alone', [
    [
      'a copy, a tuple and a receiver that copies',
      code(
        ...CONFIG,
        'import copy',
        '',
        'a = Config(copy.deepcopy(DEFAULTS))',
        'b = Config(dict(DEFAULTS))',
        'c = Store(FROZEN)',
        'd = Plain(DEFAULTS)',
      ),
      [],
    ],
    [
      'a receiver that never changes what it keeps',
      code(
        'NAMES = ["x"]',
        '',
        '',
        'class Reader:',
        '    def __init__(self, names):',
        '        self.names = names',
        '',
        '    def first(self):',
        '        return self.names[0]',
        '',
        '',
        'reader = Reader(NAMES)',
      ),
      [],
    ],
    [
      'a local of the same name and an unknown callee',
      code(
        ...CONFIG,
        'def build(DEFAULTS):',
        '    return Config(DEFAULTS)',
        '',
        '',
        'def other():',
        '    return Unknown(NAMES)',
      ),
      [],
    ],
    [
      'a test file',
      {
        files: {
          'tests/test_mod.py': code(...CONFIG, 'first = Config(DEFAULTS)'),
        },
      },
      [],
    ],
  ]);

  itOutcomes('reports a cached function whose result a caller changes', [
    [
      'a result appended to after assignment',
      code(
        'from functools import lru_cache',
        '',
        '',
        '@lru_cache(maxsize=None)',
        'def get_items():',
        '    return [1, 2]',
        '',
        '',
        'def user():',
        '    items = get_items()',
        '    items.append(3)',
      ),
      ['shared-state-mutation:5 get_items()'],
    ],
    [
      'a dict built locally and changed through the call',
      code(
        'import functools',
        '',
        '',
        '@functools.cache',
        'def get_map():',
        '    out = {}',
        '    out["a"] = 1',
        '    return out',
        '',
        '',
        'def user():',
        '    get_map()["x"] = 1',
      ),
      ['shared-state-mutation:5 get_map()'],
    ],
    [
      'a method that another method changes through self',
      code(
        'from functools import cache',
        '',
        '',
        'class Repo:',
        '    @cache',
        '    def names(self):',
        '        return sorted(["b", "a"])',
        '',
        '    def add(self):',
        '        self.names().append("c")',
      ),
      ['shared-state-mutation:6 names()'],
    ],
    [
      'a caller in another module',
      {
        files: {
          'lookup.py': 'from functools import cache\n\n\n@cache\ndef rows():\n    return [1]\n',
          'mod.py':
            'from .lookup import rows\n\n\ndef use():\n    value = rows()\n    value.extend([2])\n',
        },
      },
      ['shared-state-mutation:5 rows()'],
    ],
  ]);

  itOutcomes('leaves immutable results, copies and read-only callers alone', [
    [
      'a tuple, a copy made by the caller and a read',
      code(
        'from functools import cache\n',
        '',
        '@cache',
        'def pair():',
        '    return (1, 2)',
        '',
        '',
        '@cache',
        'def rows():',
        '    return [1]',
        '',
        '',
        'def use():',
        '    a = list(pair())',
        '    a.append(3)',
        '    b = list(rows())',
        '    b.append(3)',
        '    return len(rows())',
      ),
      [],
    ],
    [
      'a cached function that is not decorated',
      code('def rows():', '    return [1]', '', '', 'def use():', '    rows().append(2)'),
      [],
    ],
  ]);
});
