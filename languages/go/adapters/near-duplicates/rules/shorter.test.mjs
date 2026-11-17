import { beforeAll, describe, expect, it } from 'vitest';
import { shorterConditionFindings } from '../../../../../shared/rules/shorter/shorter-conditions.mjs';
import { goParser, inPackage } from '../test-support/parse-go.mjs';

let parse;

beforeAll(async () => {
  parse = await goParser();
});

function shorter(...lines) {
  return shorterConditionFindings(parse(inPackage(...lines)), {
    analyzerName: 'structure',
    isExcepted: () => false,
  }).map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe('shorter-condition on Go', () => {
  it('prints an implied operand and a complement merge', () => {
    expect(
      shorter(
        'func both(n int) bool { return n > 3 && n > 5 }',
        'func same(a, b bool) bool { return (a && b) || (a && !b) }',
      ),
    ).toEqual([
      '3: `n > 3 && n > 5` can be written as `n > 5`: `n > 5` later in the same `&&` implies it',
      '4: `(a && b) || (a && !b)` can be written as `a`: `a && b` and `a && !b` of the same `||` merge into one',
    ]);
  });

  it('leaves an operand that guards a later one alone', () => {
    expect(
      shorter('func guarded(p *T, n int) bool { return p != nil && p.count > n && p != nil }'),
    ).toEqual([]);
  });
});
