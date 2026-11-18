import { useRuleScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useRuleScripts('index-bound-off-by-one', {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('index-bound-off-by-one', () => {
  itOutcomes('flags a guard that lets the length through before a read', [
    [
      'a raise guard then a subscript',
      'def get(items, index):\n    if index < 0 or index > len(items):\n        ' +
        'raise IndexError(index)\n    return items[index]\n',
      ['index-bound-off-by-one:2 index items'],
    ],
    [
      'the read in a later operand',
      'def ok(table, c):\n    return c > len(table) or not table[c]\n',
      ['index-bound-off-by-one:2 c table'],
    ],
    [
      'a reversed comparison with a return',
      'def get(items, i):\n    if len(items) < i:\n        return None\n    return items[i]\n',
      ['index-bound-off-by-one:2 i items'],
    ],
    [
      'an accepting form',
      'def get(items, i):\n    if i <= len(items) and items[i]:\n        return items[i]\n    return None\n',
      ['index-bound-off-by-one:2 i items'],
    ],
    [
      'an attribute owner',
      'class A:\n    def get(self, i):\n        if i > len(self.items):\n            ' +
        'raise IndexError(i)\n        return self.items[i]\n',
      ['index-bound-off-by-one:3 i self.items'],
    ],
  ]);

  itOutcomes('leaves strict guards, insertion positions and other receivers', [
    [
      'a strict guard',
      'def get(items, index):\n    if index < 0 or index >= len(items):\n        ' +
        'raise IndexError(index)\n    return items[index]\n',
      [],
    ],
    [
      'an insertion position',
      'def put(items, index, value):\n    if index > len(items):\n        raise ' +
        'IndexError(index)\n    items.insert(index, value)\n',
      [],
    ],
    [
      'a different list',
      'def get(items, other, i):\n    if i > len(items):\n        return None\n    return other[i]\n',
      [],
    ],
    [
      'a guard that does not leave',
      'def get(items, i):\n    if i > len(items):\n        print("far")\n    return items[i]\n',
      [],
    ],
    [
      'the index reassigned',
      'def get(items, i):\n    if i > len(items):\n        return None\n    i = 0\n    return items[i]\n',
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_mod.py',
        code: 'def get(items, i):\n    if i > len(items):\n        return None\n    return items[i]\n',
      },
      [],
    ],
  ]);
});
