import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mjs';
import { createFactsProjects } from '../test-support/facts-projects.mjs';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function decided(text) {
  return factsOf({ 'src/shop/rules.py': text })
    .findings()
    .filter(({ rule }) => rule === 'decided-condition')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('decided-condition value models over Python functions', () => {
  it('knows that len() is not negative and that abs() is not below 0', () => {
    const text = [
      'def size(items, n):',
      '    if len(items) < 0:',
      '        return 0',
      '    if abs(n) < 0:',
      '        return 1',
      '    if len(items) > 10:',
      '        if len(items) > 5:',
      '            return 2',
      '    return 3',
      '',
    ].join('\n');

    expect(decided(text).toSorted()).toEqual([
      '2: `len(items) < 0` is always false here: a size or length is a whole number, never negative, so the code it guards never runs',
      '4: `abs(n) < 0` is always false here: an absolute value is never negative, so the code it guards never runs',
      '7: `len(items) > 5` is always true here: it is inside the `if (len(items) > 10)` on line 6',
    ]);
  });
});
