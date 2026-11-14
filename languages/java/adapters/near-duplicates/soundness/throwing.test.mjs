import { beforeAll, describe, expect, it } from 'vitest';
import { shorterConditionFindings } from '../../../../../shared/rules/shorter/shorter-conditions.mjs';
import { KOTLIN_FILE, decidedRunner, inClass } from '../test-support/decided-runner.mjs';
import { javaParser, kotlinParser } from '../test-support/parse-jvm.mjs';

let decided;
const parsers = {};

beforeAll(async () => {
  decided = await decidedRunner();
  parsers.java = await javaParser();
  parsers.kotlin = await kotlinParser();
});

function shorter(text, file) {
  const units = parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
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
