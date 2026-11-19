import { describe, expect, it } from 'vitest';
import { ruleLines } from '../test-support/facts-projects.mts';

const pythonE2eEnabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const decided = ruleLines('decided-condition', 'by-line');

describe.skipIf(!pythonE2eEnabled)('decided-condition: assignments', () => {
  it('learns a literal assignment and forgets it after a write or in a loop', () => {
    const text = [
      'def f(n, items):',
      '    retries = 0',
      '    if retries == 0:',
      '        n = 1',
      '    mode = "a"',
      '    mode = "b"',
      '    if mode == "a":',
      '        n = 2',
      '    total = 0',
      '    for item in items:',
      '        total = total + item',
      '    if total == 0:',
      '        return 1',
      '    return n',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([
      '3: `retries == 0` is always true here: `retries` is set to `0` on line 2',
      '7: `mode == "a"` is always false here: `mode` is set to `\'b\'` on line 6, so the code it guards never runs',
    ]);
  });
});
