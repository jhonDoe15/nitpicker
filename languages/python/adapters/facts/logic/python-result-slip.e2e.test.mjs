import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mjs';
import { createFactsProjects } from '../test-support/facts-projects.mjs';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function slips(text) {
  return factsOf({ 'src/shop/rules.py': text })
    .findings()
    .filter(({ rule }) => rule === 'result-slip')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('result-slip over Python functions', () => {
  it('reports find() tested with > 0 and keeps >= 0 and a containment test', () => {
    const text = [
      'def find_at(text, needle):',
      '    if text.find(needle) > 0:',
      '        return 1',
      '    if text.find(needle) >= 0 and needle in text:',
      '        return 2',
      '    return 3 if text.rfind(needle) <= 0 else 4',
      '',
    ].join('\n');

    expect(slips(text)).toEqual([
      '2: `text.find(needle) > 0` misses a match at position 0, because `find` returns 0 for it and -1 for none',
      '6: `text.rfind(needle) <= 0` misses a match at position 0, because `rfind` returns 0 for it and -1 for none',
    ]);
  });
});
