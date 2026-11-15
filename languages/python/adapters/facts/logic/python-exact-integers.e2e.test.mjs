import { afterEach, describe, expect, it } from 'vitest';
import { createFactsProjects } from '../test-support/facts-projects.mts';

const pythonE2eEnabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function decided(text) {
  return factsOf({ 'src/shop/rules.py': text })
    .findings()
    .filter(({ rule }) => rule === 'decided-condition')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('decided-condition with Python integer arithmetic', () => {
  it('adds integers exactly, because Python integers never overflow', () => {
    const text = [
      'def after(n: int):',
      '    if n > 0:',
      '        if n + 1 > 0:',
      '            return 1',
      '    return 0',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([
      '3: `n + 1 > 0` is always true here: it is inside the `if (n > 0)` on line 2',
    ]);
  });

  it('keeps sums of floats undecided', () => {
    const text = [
      'def after(x: float):',
      '    if x > 0:',
      '        if x + 1 > 0:',
      '            return 1',
      '    return 0',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([]);
  });
});
