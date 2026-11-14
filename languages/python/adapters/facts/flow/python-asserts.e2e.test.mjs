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

describe.skipIf(!pythonE2eEnabled)('decided-condition: assert statements', () => {
  it('treats assert as a guard that only removes redundant checks', () => {
    const text = [
      'def f(n):',
      '    assert n > 0',
      '    if n > 0:',
      '        return 1',
      '    if n <= 0:',
      '        return 2',
      '    return 0',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([
      '3: `n > 0` is always true here: the assert on line 2 already states this',
    ]);
  });
});
