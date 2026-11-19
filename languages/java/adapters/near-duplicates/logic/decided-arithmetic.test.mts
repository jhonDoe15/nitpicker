import { describe, expect, it } from 'vitest';
import { inClass, useRuleViews } from '../test-support/rule-views.mts';

const { decided } = useRuleViews();

describe('decided-condition with integer arithmetic on Java', () => {
  it('decides a sum that cannot overflow in its guarded range, not one that can', () => {
    const text = inClass(
      '  int f(int n) {',
      '    if (n > 0 && n < 100) {',
      '      if (n + 1 > 0) { return 1; }',
      '    }',
      '    if (n > 0) {',
      '      if (n + 1 > 0) { return 2; }',
      '    }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `n + 1 > 0` is always true here: it is inside the `if (n > 0 && n < 100)` on line 3',
    ]);
  });

  it('decides long arithmetic that cannot overflow in its guarded range', () => {
    const text = inClass(
      '  int f(long big, int small) {',
      '    if (big > 0 && big < 1000000) {',
      '      if (big * big < 1000000000000L) { return 1; }',
      '    }',
      '    if (small > 0) {',
      '      if (small * small > 0) { return 2; }',
      '    }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `big * big < 1000000000000L` is always true here: it is inside the `if (big > 0 && big < 1000000)` on line 3',
    ]);
  });

  it('knows Integer.MAX_VALUE wraps and that casts narrow', () => {
    const text = inClass(
      '  int f(int n, long m) {',
      '    if (n == Integer.MAX_VALUE) {',
      '      if (n + 1 < 0) { return 1; }',
      '    }',
      '    if (m == 3000000000L) {',
      '      if ((int) m < 0) { return 2; }',
      '    }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `n + 1 < 0` is always true here: it is inside the `if (n == Integer.MAX_VALUE)` on line 3',
      '7: `(int) m < 0` is always true here: it is inside the `if (m == 3000000000L)` on line 6',
    ]);
  });

  it('reads abs of an int as able to be negative and a remainder as taking the dividend sign', () => {
    const text = inClass(
      '  int f(int n) {',
      '    if (Math.abs(n) < 0) { return 1; }',
      '    if (n > 0) {',
      '      if (n % 2 < 0) { return 2; }',
      '    }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '5: `n % 2 < 0` is always false here: it is inside the `if (n > 0)` on line 4, so the code it guards never runs',
    ]);
  });
});

describe('decided-condition with integer arithmetic on Kotlin', () => {
  it('decides a sum in a guarded range and wraps Int.MAX_VALUE', () => {
    const text = [
      'fun f(n: Int): Int {',
      '    if (n > 0 && n < 100) {',
      '        if (n + 1 > 0) return 1',
      '    }',
      '    if (n == Int.MAX_VALUE) {',
      '        if (n + 1 < 0) return 2',
      '    }',
      '    return 0',
      '}',
    ].join('\n');

    expect(decided(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([
      '3: `n + 1 > 0` is always true here: it is inside the `if (n > 0 && n < 100)` on line 2',
      '6: `n + 1 < 0` is always true here: it is inside the `if (n == Int.MAX_VALUE)` on line 5',
    ]);
  });
});
