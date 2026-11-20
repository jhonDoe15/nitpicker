import { describe, expect, it } from 'vitest';
import { ruleLinesOf } from '../test-support/facts-projects.mts';

const pythonE2eEnabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const decided = ruleLinesOf('decided-condition');

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
