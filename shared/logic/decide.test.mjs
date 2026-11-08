import { describe, expect, it } from 'vitest';
import { decide } from './decide.mjs';
import { term } from './terms.mjs';
import { and, binary, call, number, member, name, not, or, text } from './test-support/build.mjs';

const x = name('x');
const y = name('y');
const count = { ...name('count'), integer: true };
const total = { ...name('total'), integer: true };
const cube = (value) => binary('*', binary('*', value, value), value);
const [a, b, c] = ['a', 'b', 'c'].map((label) => ({ ...name(label), integer: true }));
const allowed = call(member(name('rules'), 'allow'), name('user'));
const array = term('opaque', '[]');
const noPositiveCubeSum = [
  binary('===', binary('+', cube(a), cube(b)), cube(c)),
  binary('>', a, number(0)),
  binary('>', b, number(0)),
  binary('>', c, number(0)),
];

describe('deciding a condition under earlier guards', () => {
  it.each([
    [
      'a bound an earlier bound rules out',
      [binary('>=', x, number(10))],
      binary('<', x, number(5)),
      'false',
    ],
    [
      'a bound an earlier bound implies',
      [binary('>', x, number(3))],
      binary('>', x, number(2)),
      'true',
    ],
    [
      'a bound an earlier bound leaves open',
      [binary('>', x, number(3))],
      binary('>', x, number(5)),
      'open',
    ],
    [
      'a fraction between two bounds',
      [binary('>', x, number(2))],
      binary('<', x, number(3)),
      'open',
    ],
    [
      'the same gap for an integer',
      [binary('>', count, number(2))],
      binary('<', count, number(3)),
      'false',
    ],
    ['a value compared with itself, which NaN fails', [], binary('===', x, x), 'open'],
    ['an integer compared with itself', [], binary('===', count, count), 'true'],
    ['a fraction bound', [binary('>', x, number(0.5))], binary('>', x, number(0)), 'true'],
    [
      'an offset on an integer',
      [binary('<', binary('+', count, number(1)), total)],
      binary('<', count, total),
      'true',
    ],
    [
      'an offset on a number that is not known to be an integer',
      [binary('<', binary('+', y, number(1)), x)],
      binary('<', y, x),
      'open',
    ],
    [
      'a value every earlier branch excluded but one',
      [not(binary('===', x, text('a'))), not(binary('===', x, text('b')))],
      or(binary('===', x, text('a')), binary('===', x, text('b'))),
      'false',
    ],
    [
      'a value one earlier branch already took',
      [binary('!==', x, text('a'))],
      binary('===', x, text('a')),
      'false',
    ],
    [
      'two string values that cannot both match',
      [binary('===', x, text('a'))],
      binary('===', x, text('b')),
      'false',
    ],
    [
      'a comparison with a string, which is not ordered as a number',
      [binary('===', x, text('a'))],
      binary('<', x, number(5)),
      'open',
    ],
    ['a call repeated, which may answer differently the second time', [allowed], allowed, 'open'],
    [
      'two object literals, which are never the same object',
      [],
      binary('===', array, array),
      'open',
    ],
    [
      'a path whose guards contradict each other',
      [binary('<', x, number(3)), binary('>', x, number(5))],
      name('ready'),
      'unreachable',
    ],
    [
      'a truth value guarded by its own negation',
      [not(and(name('p'), name('q')))],
      and(name('p'), name('q')),
      'false',
    ],
  ])('answers %s', async (_case, conditions, query, answer) => {
    await expect(decide(conditions, query)).resolves.toBe(answer);
  });

  it('treats a repeated call as the same value when the caller says calls are stable', async () => {
    await expect(decide([allowed], allowed, { sameCalls: true })).resolves.toBe('true');
  });

  it('answers open when the solver runs out of its resource limit', async () => {
    const query = binary('<', a, number(100));

    await expect(decide(noPositiveCubeSum, query, { resourceLimit: 50_000 })).resolves.toBe('open');
  });
});
