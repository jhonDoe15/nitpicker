import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: [] });
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;

describe.skipIf(!enabled)('accumulator-copy skips for loops that run a few times', () => {
  it('leaves a small constant loop and a loop that stops after the copy alone', () => {
    const [actual, expected] = outcomes([
      [
        'a loop over a constant tuple',
        code(
          'def f():',
          '    acc = []',
          '    for name in ("a", "b", "c"):',
          '        acc = acc + [name]',
          '    return acc',
        ),
        [],
      ],
      [
        'a copy followed by break',
        code(
          'def f(items):',
          '    acc = []',
          '    for item in items:',
          '        if item:',
          '            acc = [*acc, item]',
          '            break',
          '    return acc',
        ),
        [],
      ],
      [
        'a loop that always breaks',
        code(
          'def f(items):',
          '    acc = []',
          '    while True:',
          '        acc = acc + [1]',
          '        break',
          '    return acc',
        ),
        [],
      ],
      [
        'a copy over a long input',
        code(
          'def f(items):',
          '    acc = []',
          '    for item in items:',
          '        acc = acc + [item]',
          '    return acc',
        ),
        ['accumulator-copy:4 acc|acc + [...]|loop'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
