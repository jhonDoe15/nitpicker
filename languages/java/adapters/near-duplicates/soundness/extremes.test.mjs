import { beforeAll, describe, expect, it } from 'vitest';
import { KOTLIN_FILE, decidedRunner, inClass } from '../test-support/decided-runner.mjs';

let decided;

beforeAll(async () => {
  decided = await decidedRunner();
});

describe('decided-condition on Math.min, Math.max, minOf and maxOf', () => {
  it('knows the bounds of the smaller and the larger of two integers', () => {
    const text = inClass(
      '  int f(int x) {',
      '    if (x > 20) { if (Math.min(x, 10) > 15) { return 1; } }',
      '    if (x > 3) { if (Math.max(0, x) < 0) { return 2; } }',
      '    if (x > 3) { if (Math.min(x, 10) <= 10) { return 3; } }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '3: `Math.min(x, 10) > 15` is always false here: it is inside the `if (x > 20)` on line 3, so the code it guards never runs',
      '4: `Math.max(0, x) < 0` is always false here: it is inside the `if (x > 3)` on line 4, so the code it guards never runs',
      '5: `Math.min(x, 10) <= 10` is always true here: it is inside the `if (x > 3)` on line 5',
    ]);
  });

  it('does not decide the smaller of two floating-point numbers, which may be NaN', () => {
    const text = inClass(
      '  int f(double x) { if (x != 3) { if (Math.min(x, 10.0) <= 10) { return 1; } } return 0; }',
    );

    expect(decided(text)).toEqual([]);
  });

  it('knows maxOf and minOf on Kotlin integers', () => {
    const text = [
      'fun f(x: Int): Int {',
      '    if (x > 3) { if (maxOf(0, x) < 0) { return 1 } }',
      '    return 0',
      '}',
      'fun g(x: Double): Int { if (x != 3.0) { if (minOf(x, 10.0) <= 10.0) { return 1 } }; return 0 }',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '2: `maxOf(0, x) < 0` is always false here: it is inside the `if (x > 3)` on line 2, so the code it guards never runs',
    ]);
  });
});
