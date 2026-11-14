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

function branches(text) {
  return factsOf({ 'src/shop/rules.py': text })
    .findings()
    .filter(({ rule }) => rule === 'duplicate-branch')
    .map(
      ({ location, classification, message }) =>
        `${String(location.line)} ${classification}: ${message.split(' If ')[0]}`,
    );
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

  it('forgets names that match, except and with bind, and leaves `== True` undecided', () => {
    const text = [
      'def parse(n, cmd, x, path):',
      '    if n > 5:',
      '        return 1',
      '    match cmd:',
      '        case "a":',
      '            n = 10',
      '    if n > 5:',
      '        return 2',
      '    if x == 1:',
      '        if x == True:',
      '            return 3',
      '    if path is None:',
      '        return 4',
      '    with open("a") as path:',
      '        pass',
      '    if path is None:',
      '        return 5',
      '    try:',
      '        pass',
      '    except ValueError as path:',
      '        pass',
      '    if path is None:',
      '        return 6',
      '    if x > 10:',
      '        return 7',
      '    if 0 < x < 20:',
      '        return 8',
      '    return 0',
      '',
    ].join('\n');

    expect(decided(text)).toEqual([
      '26: `x < 20` is always true here: the conditions before it decide it together',
    ]);
  });
});

describe.skipIf(!pythonE2eEnabled)('duplicate-branch over Python functions', () => {
  it('reports equal arms that are not adjacent elif arms, which Ruff SIM114 reports', () => {
    const text = [
      'def label(code, strict):',
      '    if code == 1:',
      '        return "low"',
      '    elif code == 2:',
      '        return "low"',
      '    elif code == 3:',
      '        return "mid"',
      '    elif strict:',
      '        return "low"',
      '    return "high"',
      '',
      '',
      'def scale(n, wide):',
      '    if wide:',
      '        doubled = n * 2',
      '        return doubled',
      '    else:',
      '        doubled = n * 2',
      '        return doubled',
      '',
    ].join('\n');

    expect(branches(text)).toEqual([
      '4 enforceable: The arms for `code == 1` (line 2), `code == 2` (line 4) and `strict` (line 8) have the same body. Merge them into one arm, or change the arm that was meant to differ.',
      '18 enforceable: The arms for `wide` (line 14) and `else` (line 18) have the same body. Merge them into one arm, or change the arm that was meant to differ.',
    ]);
  });

  it('keeps arms apart when a lambda parameter hides the variable the arm reads', () => {
    const text = [
      'def order(a, b, x, y, items):',
      '    if a:',
      '        print(x)',
      '        items.sort(key=lambda x: x.k)',
      '    elif b:',
      '        return 0',
      '    else:',
      '        print(y)',
      '        items.sort(key=lambda y: y.k)',
      '    return 1',
      '',
    ].join('\n');

    expect(branches(text)).toEqual([]);
  });
});
