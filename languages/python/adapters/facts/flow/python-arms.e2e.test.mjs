import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mts';
import { createFactsProjects } from '../test-support/facts-projects.mts';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function decided(text) {
  return factsOf({ 'src/shop/rules.py': text })
    .findings()
    .filter(({ rule }) => rule === 'decided-condition')
    .toSorted((left, right) => left.location.line - right.location.line)
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('decided-condition: match arms', () => {
  it('learns match arms and gives no fact to pattern, guarded or capture arms', () => {
    const text = [
      'def f(n, o):',
      '    match n:',
      '        case 1:',
      '            if n == 1:',
      '                return 1',
      '        case 2 | 3:',
      '            if n == 5:',
      '                return 2',
      '        case _:',
      '            if n == 1:',
      '                return 3',
      '    match o:',
      '        case str():',
      '            if o == 1:',
      '                return 4',
      '        case 4 if n > 1:',
      '            if o == 5:',
      '                return 5',
      '    match n:',
      '        case 1:',
      '            n = 2',
      '            if n == 1:',
      '                return 6',
      '        case x:',
      '            return x',
      '    return 0',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([
      '4: `n == 1` is always true here: it is in the `case 1` arm of the `match` on line 2',
      '7: `n == 5` is always false here: it is in the `case 2, 3` arm of the `match` on line 2, so the code it guards never runs',
      '10: `n == 1` is always false here: it is not `case 1` of the `match` on line 2, so the code it guards never runs',
    ]);
  });
});
