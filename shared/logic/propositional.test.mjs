import { describe, expect, it } from 'vitest';
import { decide } from './decide.mjs';
import { decideByTruthTable, needsValues } from './propositional.mjs';
import { and, binary, call, name, not, number, or, text } from './test-support/build.mjs';

const ready = name('ready');
const loaded = name('loaded');
const count = name('count');

describe('truth tables before the solver', () => {
  it.each([
    ['a guard that returned', [not(ready)], and(ready, loaded), 'false'],
    ['an enclosing branch', [ready], or(ready, loaded), 'true'],
    ['an unrelated flag', [ready], loaded, 'open'],
    ['contradicting conditions', [ready, not(ready)], loaded, 'unreachable'],
    [
      'the same comparison',
      [binary('>', count, number(10))],
      binary('>', count, number(10)),
      'true',
    ],
  ])('answers like decide for %s', async (_case, conditions, query, expected) => {
    expect(decideByTruthTable(conditions, query)).toBe(expected);
    expect(await decide(conditions, query)).toBe(expected);
  });

  const kind = name('kind');
  const is = (literal) => binary('===', kind, text(literal));

  it.each([
    ['another literal after an equality', [is('a')], is('b'), 'false'],
    [
      'the remaining literal after two others failed',
      [not(is('a')), not(is('b'))],
      is('c'),
      'open',
    ],
    ['an inequality after an equality', [is('a')], binary('!==', kind, text('b')), 'true'],
    ['two literals at once', [is('a'), is('b')], ready, 'unreachable'],
    [
      'a literal that equals the truth of the value',
      [binary('===', kind, number(0))],
      kind,
      'open',
    ],
  ])('enumerates literals for %s', async (_case, conditions, query, expected) => {
    expect(decideByTruthTable(conditions, query)).toBe(expected);
    expect(await decide(conditions, query)).toBe(expected);
  });

  it('keeps calls that may change state apart, like decide', () => {
    expect(decideByTruthTable([call(name('next'))], call(name('next')))).toBe('open');
  });

  it('gives up on more atoms than a table can hold', () => {
    const flags = Array.from({ length: 13 }, (_, index) => name(`flag${String(index)}`));
    expect(
      decideByTruthTable(
        [],
        flags.reduce((chain, flag) => or(chain, flag)),
      ),
    ).toBeUndefined();
  });

  it('sends only questions whose values link to the conditions to the solver', () => {
    const above = (bound) => binary('>', count, number(bound));
    expect(needsValues([not(above(10))], above(20))).toBe(true);
    expect(needsValues([not(above(10))], ready)).toBe(false);
    expect(
      needsValues([binary('===', name('kind'), number(1))], binary('>', count, number(1))),
    ).toBe(false);
    expect(needsValues([binary('===', count, number(3))], binary('>', count, number(2)))).toBe(
      true,
    );
  });
});
