import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mts';
import { createFactsProjects } from '../test-support/facts-projects.mts';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function decided(...lines) {
  return factsOf({ 'src/shop/rules.py': `${lines.join('\n')}\n` })
    .findings()
    .filter(({ rule }) => rule === 'decided-condition')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('decided-condition on min and max', () => {
  it('knows the bounds of min and max of two integers', () => {
    expect(
      decided(
        'def a(x: int):',
        '    if x > 20:',
        '        if min(x, 10) > 15:',
        '            return 1',
        '    return 0',
        'def b(x: int):',
        '    if x > 3:',
        '        if max(0, x) < 0:',
        '            return 1',
        '    return 0',
      ),
    ).toEqual([
      '3: `min(x, 10) > 15` is always false here: it is inside the `if (x > 20)` on line 2, so the code it guards never runs',
      '8: `max(0, x) < 0` is always false here: it is inside the `if (x > 3)` on line 7, so the code it guards never runs',
    ]);
  });

  it('does not decide min and max of floats, which may be NaN', () => {
    expect(
      decided(
        'def a(x: float):',
        '    if x != 3.0:',
        '        if min(x, 10.0) <= 10.0:',
        '            return 1',
        '    return 0',
      ),
    ).toEqual([]);
  });
});
