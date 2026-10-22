import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const loop = (before, step) =>
  code(
    'def f(items):',
    `    ${before}`,
    '    for x in items:',
    `        ${step}`,
    '    return acc',
  );
const reduceOf = (callback, init = '[]') =>
  code(
    'from functools import reduce',
    '',
    '',
    'def f(items):',
    `    return reduce(${callback}, items, ${init})`,
  );

describe.skipIf(!enabled)('accumulator-copy', () => {
  it('flags a reduce callback that returns a copy of the accumulator', () => {
    const [actual, expected] = outcomes([
      [
        'a list plus a list',
        reduceOf('lambda acc, x: acc + [x]'),
        ['accumulator-copy:5 acc|acc + [...]|reduce'],
      ],
      [
        'a list unpacked',
        reduceOf('lambda acc, x: [*acc, x]'),
        ['accumulator-copy:5 acc|[*acc, ...]|reduce'],
      ],
      [
        'a tuple unpacked',
        reduceOf('lambda acc, x: (*acc, x)', '()'),
        ['accumulator-copy:5 acc|(*acc, ...)|reduce'],
      ],
      [
        'a dict unpacked',
        reduceOf('lambda acc, x: {**acc, x.key: x}', '{}'),
        ['accumulator-copy:5 acc|{**acc, ...}|reduce'],
      ],
      [
        'a dict union',
        reduceOf('lambda acc, x: acc | {x.key: x}', '{}'),
        ['accumulator-copy:5 acc|acc | {...}|reduce'],
      ],
      [
        'a prepend',
        reduceOf('lambda acc, x: [x] + acc'),
        ['accumulator-copy:5 acc|[...] + acc|reduce'],
      ],
      [
        'a named callback',
        code(
          'import functools',
          '',
          '',
          'def collect(seen, item):',
          '    return seen + [item]',
          '',
          '',
          'def f(items):',
          '    return functools.reduce(collect, items, [])',
        ),
        ['accumulator-copy:9 seen|seen + [...]|reduce'],
      ],
      [
        'a conditional copy',
        reduceOf('lambda acc, x: acc + [x] if x else acc'),
        ['accumulator-copy:5 acc|acc + [...]|reduce'],
      ],
      [
        'a list accumulator plus a variable',
        reduceOf('lambda acc, x: acc + x'),
        ['accumulator-copy:5 acc|acc + [...]|reduce'],
      ],
      ['a number accumulator plus a variable', reduceOf('lambda acc, x: acc + x', '0'), []],
      ['an accumulator of unknown type', reduceOf('lambda acc, x: acc + x', 'start'), []],
      ['a sum of numbers', reduceOf('lambda a, b: a + b', '0'), []],
      [
        'operator.add',
        code(
          'import functools',
          'import operator',
          '',
          '',
          'def f(items):',
          '    return functools.reduce(operator.add, items)',
        ),
        [],
      ],
      ['a product', reduceOf('lambda a, b: a * b', '1'), []],
      ['a callback that appends', reduceOf('lambda acc, x: acc.append(x) or acc'), []],
    ]);
    expect(actual).toEqual(expected);
  });

  it('flags a loop that replaces a name by a copy of itself', () => {
    const [actual, expected] = outcomes([
      [
        'a list plus a list',
        loop('acc = []', 'acc = acc + [x]'),
        ['accumulator-copy:4 acc|acc + [...]|loop'],
      ],
      [
        'a list unpacked',
        loop('acc = []', 'acc = [*acc, x]'),
        ['accumulator-copy:4 acc|[*acc, ...]|loop'],
      ],
      [
        'a tuple unpacked',
        loop('acc = ()', 'acc = (*acc, x)'),
        ['accumulator-copy:4 acc|(*acc, ...)|loop'],
      ],
      [
        'a dict unpacked',
        loop('acc = {}', 'acc = {**acc, x.key: x}'),
        ['accumulator-copy:4 acc|{**acc, ...}|loop'],
      ],
      [
        'a dict union',
        loop('acc = {}', 'acc = acc | {x.key: x}'),
        ['accumulator-copy:4 acc|acc | {...}|loop'],
      ],
      [
        'a set union',
        loop('acc = set()', 'acc = acc | {x}'),
        ['accumulator-copy:4 acc|acc | {...}|loop'],
      ],
      [
        'a tuple extended in place syntax',
        loop('acc = ()', 'acc += (x,)'),
        ['accumulator-copy:4 acc|acc += (...,)|loop'],
      ],
      [
        'a while loop',
        code(
          'def f(items):',
          '    acc = []',
          '    while items:',
          '        acc = acc + [items.pop()]',
          '    return acc',
        ),
        ['accumulator-copy:4 acc|acc + [...]|loop'],
      ],
      [
        'a parameter',
        code(
          'def f(items, acc):',
          '    for x in items:',
          '        acc = acc + [x]',
          '    return acc',
        ),
        ['accumulator-copy:3 acc|acc + [...]|loop'],
      ],
      [
        'an inner loop',
        code(
          'def f(rows):',
          '    for row in rows:',
          '        acc = []',
          '        for x in row:',
          '            acc = acc + [x]',
        ),
        ['accumulator-copy:5 acc|acc + [...]|loop'],
      ],
      [
        'a list accumulator plus a variable',
        loop('acc = []', 'acc = acc + x'),
        ['accumulator-copy:4 acc|acc + [...]|loop'],
      ],
      [
        'a list from list() that is prepended to',
        loop('acc = list()', 'acc = x + acc'),
        ['accumulator-copy:4 acc|[...] + acc|loop'],
      ],
      ['appending', loop('acc = []', 'acc.append(x)'), []],
      ['extending a list in place', loop('acc = []', 'acc += [x]'), []],
      ['a tuple operator on a list', loop('acc = []', 'acc += (x,)'), []],
      ['a counter', loop('acc = 0', 'acc = acc + 1'), []],
      ['a string', loop('acc = ""', 'acc = acc + "x"'), []],
      ['a dict filled in place', loop('acc = {}', 'acc[x.key] = x'), []],
      ['a dict updated in place', loop('acc = {}', 'acc |= {x.key: x}'), []],
      [
        'a name bound only in the loop',
        code(
          'def f(rows):',
          '    for row in rows:',
          '        acc = []',
          '        acc = [row]',
          '    return 1',
        ),
        [],
      ],
      [
        'a copy outside any loop',
        code('def f(acc, x):', '    acc = acc + [x]', '    return acc'),
        [],
      ],
      ['a comprehension', code('def f(items):', '    return [x for x in items]'), []],
      [
        'itertools.chain',
        code(
          'import itertools',
          '',
          '',
          'def f(lists):',
          '    return list(itertools.chain.from_iterable(lists))',
        ),
        [],
      ],
      [
        'a defaultdict',
        code(
          'import collections',
          '',
          '',
          'def f(items):',
          '    groups = collections.defaultdict(list)',
          '    for x in items:',
          '        groups[x.key].append(x)',
          '    return groups',
        ),
        [],
      ],
      ['a test file', { file: 'tests/test_a.py', code: loop('acc = []', 'acc = acc + [x]') }, []],
    ]);
    expect(actual).toEqual(expected);
  });
});
