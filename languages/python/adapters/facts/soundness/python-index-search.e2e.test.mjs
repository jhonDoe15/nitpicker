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

describe.skipIf(!pythonE2eEnabled)('decided-condition on str.find and str.rfind', () => {
  it('knows a search of a string returns at least -1', () => {
    expect(
      decided(
        'def a(s: str):',
        '    if s.find("x") < -1:',
        '        return 1',
        '    if s.rfind("x") < -1:',
        '        return 2',
        '    return 0',
      ),
    ).toEqual([
      '2: `s.find("x") < -1` is always false here: an index search returns -1 or a position, so the code it guards never runs',
      '4: `s.rfind("x") < -1` is always false here: an index search returns -1 or a position, so the code it guards never runs',
    ]);
  });

  it('gives find on a value that is not known to be a string no fact', () => {
    expect(
      decided(
        'def a(s):',
        '    if s.find("x") < -1:',
        '        return 1',
        '    return 0',
        'def b(s: Finder):',
        '    if s.find("x") < -1:',
        '        return 1',
        '    return 0',
      ),
    ).toEqual([]);
  });
});
