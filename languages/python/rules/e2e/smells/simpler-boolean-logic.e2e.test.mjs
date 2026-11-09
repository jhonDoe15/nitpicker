import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['boolean-flag-parameter'] });
afterEach(cleanup);

describe.skipIf(!enabled)('simpler-boolean-logic', () => {
  it('prints the simpler form of a negated if, a negated ternary and an all-negated chain', () => {
    const [actual, expected] = outcomes([
      [
        'an if not with an else',
        'def run(a, x, y):\n    if not a:\n        x()\n    else:\n        y()\n',
        ['simpler-boolean-logic:2 swap if a: … else: …'],
      ],
      [
        'an else that holds an if',
        'def run(a, b, x, y):\n    if not a:\n        x()\n    else:\n        if b:\n            y()\n',
        ['simpler-boolean-logic:2 swap if a: … else: …'],
      ],
      [
        'a negated ternary',
        'def run(a, b, c):\n    return b if not a else c\n',
        ['simpler-boolean-logic:2 swap c if a else b'],
      ],
      [
        'an and of negations',
        'def run(a, b, c):\n    return not a and not b and not c\n',
        ['simpler-boolean-logic:2 not (a or b or c)'],
      ],
      [
        'an or of negations that holds an and',
        'def run(a, b, c):\n    return not a or not (b and c)\n',
        ['simpler-boolean-logic:2 not (a and b and c)'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves forms that are already simplest alone', () => {
    const [actual, expected] = outcomes([
      [
        'an elif chain',
        'def run(a, b, x, y):\n    if not a:\n        x()\n    elif b:\n        y()\n',
        [],
      ],
      ['an if not without an else', 'def run(a, x):\n    if not a:\n        x()\n', []],
      [
        'a ternary whose else is a ternary',
        'def run(a, b, c, d, e):\n    return b if not a else (c if d else e)\n',
        [],
      ],
      [
        'a chain with an operand that is not negated',
        'def run(a, b):\n    return not a and b\n',
        [],
      ],
      [
        'a twisted ternary, which ruff SIM212 reports',
        'def run(a, b):\n    return b if not a else a\n',
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
