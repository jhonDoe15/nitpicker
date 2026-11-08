import { describe, expect, it } from 'vitest';
import { decide } from './decide.mjs';
import { and, binary, call, number, member, name, not, or, text } from './test-support/build.mjs';

const x = name('x');
const y = name('y');
const z = name('z');
const cube = (value) => binary('*', binary('*', value, value), value);
const noPositiveCubeSum = [
  binary('===', binary('+', cube(x), cube(y)), cube(z)),
  binary('>', x, number(0)),
  binary('>', y, number(0)),
  binary('>', z, number(0)),
];

describe('deciding a condition under earlier guards', () => {
  it.each([
    [
      'a comparison an earlier bound rules out',
      [binary('>=', x, number(10))],
      binary('<', x, number(5)),
      'false',
    ],
    [
      'a comparison an earlier bound implies',
      [binary('>', x, number(3))],
      binary('>', x, number(2)),
      'true',
    ],
    [
      'a comparison an earlier bound leaves open',
      [binary('>', x, number(3))],
      binary('>', x, number(5)),
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
      'a call repeated with the same arguments',
      [call(member(name('rules'), 'allow'), name('user'))],
      call(member(name('rules'), 'allow'), name('user')),
      'true',
    ],
    [
      'an offset on one side of a comparison',
      [binary('<', binary('+', y, number(1)), x)],
      binary('<', y, x),
      'true',
    ],
    [
      'a fraction, which integer reasoning does not cover',
      [binary('>', x, number(0.5))],
      binary('>', x, number(0)),
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
      [not(and(name('a'), name('b')))],
      and(name('a'), name('b')),
      'false',
    ],
  ])('answers %s', async (_case, conditions, query, answer) => {
    await expect(decide(conditions, query)).resolves.toBe(answer);
  });

  it('answers open when the solver runs out of its resource limit', async () => {
    await expect(
      decide(noPositiveCubeSum, binary('<', x, number(100)), { resourceLimit: 50_000 }),
    ).resolves.toBe('open');
  });
});
