import { describe, expect, it } from 'vitest';
import { ruleLines } from '../test-support/facts-projects.mts';

const pythonE2eEnabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const decided = ruleLines('decided-condition', 'by-line');

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
      '3: `n > 0` is always true here: the assert on line 2 already states this, and assertions may be off at run time',
    ]);
  });
});
