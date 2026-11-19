import { describe, expect, it } from 'vitest';
import { inClass, useRuleViews } from '../test-support/rule-views.mts';

const { slips } = useRuleViews();

describe('integer-slip on Java', () => {
  it('reports a difference compared with 0 and names the inputs', () => {
    const found = slips(inClass('  boolean after(int a, int b) {', '    return a - b > 0;', '  }'));

    expect(found.map((line) => line.replaceAll(/ = -?\d+/gu, ' = N'))).toEqual([
      '3: `a - b > 0` does not compare the operands: the subtraction overflows for a = N, b = N',
    ]);
  });

  it('reports a comparator that returns a difference', () => {
    const text = inClass(
      '  int compare(Item a, Item b) { return 0; }',
      '  int compareTo(int a, int b) {',
      '    return a - b;',
      '  }',
    );

    expect(slips(text).map((line) => line.replaceAll(/ = -?\d+/gu, ' = N'))).toEqual([
      '4: `a - b` is not a valid comparison result: the subtraction overflows for a = N, b = N',
    ]);
  });

  it('reports Math.abs used as an index or bucket', () => {
    const text = inClass(
      '  int bucket(int hash, int n) {',
      '    return Math.abs(hash) % n;',
      '  }',
      '  int pick(int[] items, int hash) {',
      '    return items[Math.abs(hash)];',
      '  }',
    );

    expect(slips(text)).toHaveLength(2);
  });

  it('does not report differences that cannot overflow', () => {
    const text = inClass(
      '  boolean a(int a, int b) {',
      '    if (a >= 0 && a < 1000 && b >= 0 && b < 1000) { return a - b > 0; }',
      '    return false;',
      '  }',
      '  boolean b(java.util.List<String> x, java.util.List<String> y) {',
      '    return x.size() - y.size() > 0;',
      '  }',
      '  boolean c(long a, long b) { return a < b; }',
      '  int d(int hash, int n) { return Math.floorMod(hash, n); }',
      '  int e(int hash, int n) {',
      '    if (hash != Integer.MIN_VALUE) { return Math.abs(hash) % n; }',
      '    return 0;',
      '  }',
    );

    expect(slips(text)).toEqual([]);
  });

  it('leaves a remainder test to SpotBugs on Java', () => {
    expect(slips(inClass('  boolean odd(int x) {', '    return x % 2 == 1;', '  }'))).toEqual([]);
  });
});

describe('integer-slip on Kotlin', () => {
  it('reports a difference and a remainder test on a parameter', () => {
    const text = [
      'class Rules {',
      '  fun after(a: Int, b: Int): Boolean { return a - b > 0 }',
      '  fun odd(x: Int): Boolean { return x % 2 == 1 }',
      '}',
    ].join('\n');

    expect(slips(text, 'src/main/kotlin/Rules.kt')).toHaveLength(2);
  });

  it('does not report a remainder test once the value is known to be non-negative', () => {
    const text = [
      'class Rules {',
      '  fun odd(x: Int): Boolean {',
      '    if (x < 0) { return false }',
      '    return x % 2 == 1',
      '  }',
      '}',
    ].join('\n');

    expect(slips(text, 'src/main/kotlin/Rules.kt')).toEqual([]);
  });
});
