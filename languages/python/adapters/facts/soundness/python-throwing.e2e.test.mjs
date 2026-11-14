import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mjs';
import { createFactsProjects } from '../test-support/facts-projects.mjs';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function findings(...lines) {
  return factsOf({ 'src/shop/rules.py': `${lines.join('\n')}\n` })
    .findings()
    .filter(({ rule }) => rule === 'decided-condition' || rule === 'shorter-condition')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('conditions with an operand that raises', () => {
  it('does not decide or shorten a condition whose operand divides by zero', () => {
    expect(
      findings(
        'def a(x):',
        '    if x == 5:',
        '        return x / 0 == 1',
        '    return False',
        'def b(a, flag):',
        '    return (flag and a / 0 > 1) or (flag and a / 0 <= 1)',
        'def c(a, d, flag):',
        '    return (flag and a // d > 1) or (flag and a // d <= 1)',
        'def d(a, flag):',
        '    return (flag and a % 0 > 1) or (flag and a % 0 <= 1)',
      ),
    ).toEqual([]);
  });
});
