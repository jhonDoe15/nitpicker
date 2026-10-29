import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const SIZE = 1000;
const range = Array.from({ length: SIZE }, (_, index) => index);

const elifChain = (action) =>
  `def pick(x):\n    if x == 0:\n        ${action(0)}\n${range
    .slice(1)
    .map((index) => `    elif x == ${String(index)}:\n        ${action(index)}\n`)
    .join('')}`;

const FILES = {
  'src/app/chain.py': elifChain((index) => `return ${String(index)}`),
  'src/app/terms.py': `TOTAL = ${range.map((index) => `v${String(index)}`).join(' + ')}\n`,
  'src/app/text.py': `TEXT = ${range.map((index) => `"s${String(index)}"`).join(' + ')}\n`,
  'src/app/attributes.py': `VALUE = a${range.map((index) => `.b${String(index)}`).join('')}\n`,
  'src/app/calls.py': `VALUE = a${range.map((index) => `.m${String(index)}()`).join('')}\n`,
  'src/app/domain/chain.py': elifChain((index) => `return ${String(index)}`),
  'src/app/settings.py': `if MODE == 0:\n    LEVEL = 0\n${range
    .slice(1)
    .map((index) => `elif MODE == ${String(index)}:\n    LEVEL = ${String(index)}\n`)
    .join('')}`,
  'src/app/adapters/terms.py': `TOTAL = f(${range.map((index) => `v${String(index)}`).join(' + ')})\n`,
  'tests/test_terms.py': `def test_a():\n    assert ${range.map((index) => `v${String(index)}`).join(' + ')} == 1\n`,
  'tests/test_chain.py': elifChain((index) => `assert ${String(index)}`).replace(
    'def pick(x)',
    'def test_a(x)',
  ),
  'tests/test_logic.py': `def test_a():\n    assert ${range.map((index) => `not v${String(index)}`).join(' or ')}\n`,
};

describe.skipIf(!enabled)('the rules script on very long chains', () => {
  it('reports no failed check and loses no finding on a 1,000 branch chain or 1,000 term expression', () => {
    const lines = findingsOf(FILES);

    expect(lines.filter((line) => /^rules-(?:check-)?failed /u.test(line))).toEqual([]);
    expect(lines.some((line) => line.startsWith('conditional-assertion-in-test '))).toBe(true);
  });
});
