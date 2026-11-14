import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mjs';
import { createFactsProjects } from '../test-support/facts-projects.mjs';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function decided(text) {
  return factsOf({ 'src/shop/rules.py': text })
    .findings()
    .filter(({ rule }) => rule === 'decided-condition')
    .toSorted((left, right) => left.location.line - right.location.line)
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('decided-condition: loops, conditionals and closures', () => {
  it('uses range bounds as loop facts', () => {
    const text = [
      'def f(a, b):',
      '    for i in range(a, b):',
      '        if i >= b:',
      '            return 1',
      '    for i in range(b):',
      '        if i < 0:',
      '            return 2',
      '    for i in range(a, b, -1):',
      '        if i <= b:',
      '            return 3',
      '    for i in range(a, b, 2):',
      '        if i < a:',
      '            return 4',
      '    return 0',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([
      '3: `i >= b` is always false here: the loop on line 2 only runs for `i` in `range(a, b)`, so the code it guards never runs',
      '6: `i < 0` is always false here: the loop on line 5 only runs for `i` in `range(b)`, so the code it guards never runs',
      '9: `i <= b` is always false here: the loop on line 8 only runs for `i` in `range(a, b, -1)`, so the code it guards never runs',
      '12: `i < a` is always false here: the loop on line 11 only runs for `i` in `range(a, b, 2)`, so the code it guards never runs',
    ]);
  });

  it('forgets a range bound the loop body changes', () => {
    const text = [
      'def f(b):',
      '    for i in range(b):',
      '        b = 1',
      '        if i >= b:',
      '            return 1',
      '    return 0',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([]);
  });

  it('uses the test of a conditional expression in its branches', () => {
    const text = [
      'def f(x):',
      '    a = (1 if x > 3 else 2) if x > 5 else 3',
      '    b = 1 if x > 5 else (2 if x > 7 else 3)',
      '    return a + b',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([
      '2: `x > 3` is always true here: it is in the true branch of the conditional `x > 5` on line 2',
      '3: `x > 7` is always false here: it is in the false branch of the conditional `x > 5` on line 3, so the code it guards never runs',
    ]);
  });

  it('carries facts about names that cannot change into lambdas and nested functions', () => {
    const text = [
      'def f(n, items):',
      '    if n > 5:',
      '        g = lambda: 1 if n > 3 else 0',
      '        def h():',
      '            return 1 if n > 4 else 0',
      '        return g, h',
      '    return None',
      '',
      '',
      'def k(n):',
      '    if n > 5:',
      '        n = 1',
      '    return lambda: 1 if n > 3 else 0',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([
      '3: `n > 3` is always true here: it is inside the `if (n > 5)` on line 2',
      '5: `n > 4` is always true here: it is inside the `if (n > 5)` on line 2',
    ]);
  });
});
