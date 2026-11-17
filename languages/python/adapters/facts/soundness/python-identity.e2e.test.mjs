import { afterEach, describe, expect, it } from 'vitest';
import { createFactsProjects } from '../test-support/facts-projects.mts';

const pythonE2eEnabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function decided(...lines) {
  return factsOf({ 'src/shop/rules.py': `${lines.join('\n')}\n` })
    .findings()
    .filter(({ rule }) => rule === 'decided-condition')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('decided-condition on Python identity', () => {
  it('does not read `is` as `==`', () => {
    expect(
      decided(
        'def a(x, y):',
        '    if x is y:',
        '        return 1',
        '    if x == y:',
        '        return 2',
        'def b(x):',
        '    if x is 5:',
        '        return 1',
        '    if x == 5:',
        '        return 2',
        'def c(x, y):',
        '    return x == y and x is not y',
        'def d(x):',
        '    if x != 0:',
        '        return 1',
        '    if x is 0:',
        '        return 2',
        'def e(x):',
        '    if x is True:',
        '        if x == 1:',
        '            return 1',
      ),
    ).toEqual([]);
  });

  it('still decides `is None` and a repeated identity test', () => {
    expect(
      decided(
        'def a(x):',
        '    if x is None:',
        '        return 1',
        '    if x is not None:',
        '        return 2',
        'def b(x, y):',
        '    if x is y:',
        '        return 1',
        '    if x is y:',
        '        return 2',
      ),
    ).toEqual([
      '4: `x is not None` is always true here: line 2 returns when `x is None` is true',
      '9: `x is y` is always false here: line 7 returns when `x is y` is true, so the code it guards never runs',
    ]);
  });
});
