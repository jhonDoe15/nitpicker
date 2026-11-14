import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mjs';
import { createFactsProjects } from '../test-support/facts-projects.mjs';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function decided(...lines) {
  return factsOf({ 'src/shop/rules.py': `${lines.join('\n')}\n` })
    .findings()
    .filter(({ rule }) => rule === 'decided-condition')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('decided-condition when a name is rebound', () => {
  it('does not inline a module helper that a parameter, a local def or an import shadows', () => {
    expect(
      decided(
        'def pos(x):',
        '    return x > 0',
        'def a(n, pos):',
        '    if pos(n):',
        '        if n <= 0:',
        '            return 1',
        'def b(n):',
        '    def pos(x):',
        '        return x < 0',
        '    if pos(n):',
        '        if n >= 0:',
        '            return 1',
        'def c(n):',
        '    from other import pos',
        '    if pos(n):',
        '        if n >= 0:',
        '            return 1',
      ),
    ).toEqual([]);
  });

  it('inlines the module helper when nothing shadows it', () => {
    expect(
      decided(
        'def pos(x):',
        '    return x > 0',
        'def d(n):',
        '    if pos(n):',
        '        if n <= 0:',
        '            return 1',
      ),
    ).toEqual([
      '5: `n <= 0` is always false here: it is inside the `if (pos(n))` on line 4, and `pos` tests `x > 0`, so the code it guards never runs',
    ]);
  });

  it('forgets a value after an import rebinds the name', () => {
    expect(
      decided(
        'def m(a):',
        '    x = 5',
        '    import os as x',
        '    if x == 5:',
        '        return 1',
        'def n(a):',
        '    x = 5',
        '    from os import path as x',
        '    if x == 5:',
        '        return 1',
      ),
    ).toEqual([]);
  });
});
