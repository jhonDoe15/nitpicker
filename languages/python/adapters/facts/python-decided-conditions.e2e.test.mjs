import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../e2e/test-support/python-e2e-support.mjs';
import { createFactsProjects } from './test-support/facts-projects.mjs';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function decided(text) {
  return factsOf({ 'src/shop/rules.py': text })
    .findings()
    .filter(({ rule }) => rule === 'decided-condition')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)('decided-condition over Python functions', () => {
  it('reports checks that guards, elif arms and `and` operands decide', () => {
    const text = [
      'def size(count, user, flag):',
      '    if count > 10:',
      '        return "many"',
      '    if count > 20:',
      '        return "lots"',
      '    if user is None:',
      '        raise ValueError("user")',
      '    if user is not None and flag:',
      '        return "flagged"',
      '    elif flag:',
      '        return "dead"',
      '    return "few"',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([
      '4: `count > 20` is always false here: line 2 returns when `count > 10` is true, so the code it guards never runs',
      '10: `flag` is always false here: the conditions before it decide it together, so the code it guards never runs',
      '8: `user is not None` is always true here: line 6 throws when `user is None` is true',
    ]);
  });

  it('forgets a guard after the name is assigned or a call may change a module name', () => {
    const text = [
      'LIMIT = 3',
      '',
      '',
      'def clamp(n):',
      '    if n > 10:',
      '        return 10',
      '    n = n * 2',
      '    if n > 10:',
      '        return 11',
      '    if LIMIT > 3:',
      '        return 3',
      '    reload()',
      '    if LIMIT > 3:',
      '        return 4',
      '    return n',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([]);
  });
});
