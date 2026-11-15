import { afterEach, describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mts';
import { createFactsProjects } from '../test-support/facts-projects.mts';

const { factsOf, cleanup } = createFactsProjects();

afterEach(cleanup);

function decided(text) {
  return factsOf({ 'src/shop/rules.py': text })
    .findings()
    .filter(({ rule }) => rule === 'decided-condition')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe.skipIf(!pythonE2eEnabled)(
  'decided-condition through same-file helpers over Python',
  () => {
    it('sees a guard written through a module function and names it', () => {
      const text = [
        'def valid(n):',
        '    return n > 0',
        '',
        '',
        'def check(n):',
        '    if not valid(n):',
        '        return 0',
        '    if n <= 0:',
        '        return 1',
        '    return 2',
        '',
      ].join('\n');

      expect(decided(text)).toEqual([
        '8: `n <= 0` is always false here: line 6 returns when `not valid(n)` is true, and `valid` tests `n > 0`, so the code it guards never runs',
      ]);
    });

    it('leaves a method and a helper that reads a changed module name opaque', () => {
      const text = [
        'LIMIT = 3',
        '',
        '',
        'class Rules:',
        '    def valid(self, n):',
        '        return n > 0',
        '',
        '    def check(self, n):',
        '        if not self.valid(n):',
        '            return 0',
        '        return 1 if n <= 0 else 2',
        '',
        '',
        'def under(n):',
        '    return n < LIMIT',
        '',
        '',
        'def bump(n):',
        '    global LIMIT',
        '    if not under(n):',
        '        return 0',
        '    LIMIT = 1',
        '    return 1 if under(n) else 2',
        '',
      ].join('\n');

      expect(decided(text)).toEqual([]);
    });
  },
);
