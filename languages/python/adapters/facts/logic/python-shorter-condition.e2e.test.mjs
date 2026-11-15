import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mts';
import { createFactsProjects } from '../test-support/facts-projects.mts';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function shorter(text) {
  return factsOf({ 'src/shop/rules.py': text })
    .findings()
    .filter(({ rule }) => rule === 'shorter-condition')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('shorter-condition over Python functions', () => {
  it('prints the shorter form with and, or and not', () => {
    const text = [
      'def both(n):',
      '    return n > 3 and n > 5',
      '',
      '',
      'def same(a, b):',
      '    if (a and b) or (a and not b):',
      '        return 1',
      '    return 0',
      '',
      '',
      'def span(x):',
      '    return (x >= 0 and x < 10) or (x >= 10 and x < 20)',
      '',
    ].join('\n');

    expect(shorter(text)).toEqual([
      '2: `n > 3 and n > 5` can be written as `n > 5`: `n > 5` later in the same `and` implies it',
      '6: `(a and b) or (a and not b)` can be written as `a`: `a and b` and `a and not b` of the same `or` merge into one',
      '12: `(x >= 0 and x < 10) or (x >= 10 and x < 20)` can be written as `x >= 0 and x < 20`: `x >= 0 and x < 10` and `x >= 10 and x < 20` of the same `or` merge into one',
    ]);
  });

  it('leaves values, guards, calls with effects and long conditions alone', () => {
    const text = [
      'def value(a, b):',
      '    return (a and b) or (a and not b)',
      '',
      '',
      'def guard(s):',
      '    return s is not None and len(s) > 3 and len(s) > 5',
      '',
      '',
      'def calls(n):',
      '    return n() > 3 and n() > 5',
      '',
      '',
      'def floats(x):',
      '    return x < 5 or x >= 5',
      '',
    ].join('\n');

    expect(shorter(text)).toEqual([]);
  });
});
