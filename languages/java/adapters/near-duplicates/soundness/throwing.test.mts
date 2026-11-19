import { beforeAll, describe, expect, it } from 'vitest';
import { shorterConditionFindings } from '../test-support/engine-views.mts';
import {
  KOTLIN_FILE,
  decidedRunner,
  inClass,
  type Decided,
} from '../test-support/decided-runner.mts';
import { useUnits } from '../test-support/rule-views.mts';

let decided: Decided;
const unitsOf = useUnits();

beforeAll(async () => {
  decided = await decidedRunner();
});

function shorter(text: string, file: string): unknown[] {
  const units = unitsOf(text, file);
  return shorterConditionFindings(units, { analyzerName: 'structure', isExcepted: () => false });
}

describe('conditions with an operand that throws', () => {
  it('does not decide a comparison that divides by zero', () => {
    const text = inClass('  boolean f(int x) { if (x == 5) { return x / 0 == 1; } return false; }');

    expect(decided(text)).toEqual([]);
  });

  it('does not shorten a condition that evaluates an operand that may throw', () => {
    const java = inClass(
      '  boolean a(int x, boolean b) { return (b && x / 0 > 1) || (b && x / 0 <= 1); }',
      '  boolean c(int x, int d, boolean b) { return (b && x / d > 1) || (b && x % d <= 1); }',
      '  boolean e(int[] v, boolean b) { return (b && v[3] > 1) || (b && v[3] <= 1); }',
    );
    const kotlin =
      'fun a(x: Int, b: Boolean): Boolean { return (b && x / 0 > 1) || (b && x / 0 <= 1) }';

    expect(shorter(java, 'src/main/java/shop/Rules.java')).toEqual([]);
    expect(shorter(kotlin, KOTLIN_FILE)).toEqual([]);
  });
});
