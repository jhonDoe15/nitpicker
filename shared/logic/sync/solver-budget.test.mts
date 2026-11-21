import { describe, expect, it } from 'vitest';
import { binary, name, not, number } from '../test-support/build.mts';
import type { Term } from '../typed/term-types.mts';
import { solverBudget } from './budget.mts';
import { counterexampleSync, decideSync } from './decide-sync.mts';

const count = name('budgeted');
const conditions = [not(binary('>', count, number('10')))];
const query = binary('>', count, number('20'));

describe('the solver budget of a unit', () => {
  it('answers open once the runs it allows are spent, and a repeated question costs nothing', () => {
    const budget = solverBudget(1);

    expect(decideSync(conditions, query, { budget })).toBe('false');
    expect(budget.remaining()).toBe(0);
    expect(decideSync(conditions, query, { budget })).toBe('false');
    expect(decideSync([], binary('>', count, number('30')), { budget })).toBe('open');
    expect(counterexampleSync([], binary('>', count, number('31')), { budget })).toBeUndefined();
  });

  it('keeps the answers of one run by the terms asked', () => {
    const first = decideSync([], binary('<', count, number('5')), { integers: true });

    expect(decideSync([], binary('<', count, number('5')), { integers: true })).toBe(first);
    expect(decideSync([], binary('<', count, number('5')))).toBe('open');
  });

  it('solves the same terms at another place once, and still counts the run', () => {
    const placed = (start: number): Term => ({
      ...binary('>=', name('placed'), number('40')),
      range: [start, start + 9],
    });
    const budget = solverBudget(2);
    const first = decideSync([], placed(10), { budget, integers: true });

    expect(decideSync([], placed(500), { budget, integers: true })).toBe(first);
    expect(budget.remaining()).toBe(0);
    expect(decideSync([], placed(900), { budget, integers: true })).toBe('open');
  });
});
