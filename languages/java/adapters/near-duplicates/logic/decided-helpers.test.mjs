import { beforeAll, describe, expect, it } from 'vitest';
import { decidedConditionFindings } from '../../../../../shared/rules/decided/decided-conditions.mjs';
import { javaParser, kotlinParser } from '../test-support/parse-jvm.mts';

const parsers = {};

beforeAll(async () => {
  parsers.java = await javaParser();
  parsers.kotlin = await kotlinParser();
});

function decided(text, file = 'src/main/java/shop/Rules.java') {
  const units = parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
  return decidedConditionFindings(units, {
    analyzerName: 'structure',
    isExcepted: () => false,
  }).map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

function inClass(...lines) {
  return ['class Rules {', ...lines, '}'].join('\n');
}

describe('decided-condition through same-file helpers on Java', () => {
  it('sees a guard written through a private predicate and names the helper', () => {
    const text = inClass(
      '  private boolean valid(int n) { return n > 0; }',
      '  int f(int n) {',
      '    if (!valid(n)) { return 0; }',
      '    if (n <= 0) { return 1; }',
      '    return valid(n) ? 2 : 3;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '5: `n <= 0` is always false here: line 4 returns when `!valid(n)` is true, and `valid` tests `n > 0`, so the code it guards never runs',
      '6: `valid(n)` is always true here: line 5 returns when `n <= 0` is true, and `valid` tests `n > 0`',
    ]);
  });

  it('inlines a helper that calls another helper, through two levels only', () => {
    const text = inClass(
      '  private static boolean positive(int n) { return n > 0; }',
      '  private static boolean small(int n) { return positive(n) && n < 10; }',
      '  private static boolean tiny(int n) { return small(n) && n < 3; }',
      '  int f(int n) {',
      '    if (small(n)) { return 0; }',
      '    if (n < 0) { return 1; }',
      '    if (tiny(n)) { return 2; }',
      '    return 3;',
      '  }',
    );

    expect(decided(text)).toEqual([]);
  });

  it('reports a check that a two-level helper decides and names both helpers', () => {
    const text = inClass(
      '  private static boolean positive(int n) { return n > 0; }',
      '  private static boolean small(int n) { return positive(n) && n < 10; }',
      '  int f(int n) {',
      '    if (!small(n)) { return 0; }',
      '    return n < 0 ? 1 : 2;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '6: `n < 0` is always false here: line 5 returns when `!small(n)` is true, and `small` tests `positive(n) && n < 10`, and `positive` tests `n > 0`, so the code it guards never runs',
    ]);
  });

  it('leaves an overridable method, a recursive helper and a changed field opaque', () => {
    const text = inClass(
      '  private int limit;',
      '  boolean open(int n) { return n > 0; }',
      '  private boolean deep(int n) { return n > 0 && deep(n - 1); }',
      '  private boolean under(int n) { return n < limit; }',
      '  int f(int n) {',
      '    if (!open(n)) { return 0; }',
      '    if (!deep(n)) { return 2; }',
      '    return n <= 0 ? 1 : 3;',
      '  }',
      '  int g(int n) {',
      '    if (!under(n)) { return 4; }',
      '    limit = 3;',
      '    return under(n) ? 5 : 6;',
      '  }',
    );

    expect(decided(text)).toEqual([]);
  });
});

describe('decided-condition through same-file helpers on Kotlin', () => {
  it('sees a guard written through a private function', () => {
    const text = [
      'private fun valid(n: Int): Boolean { return n > 0 }',
      'fun f(n: Int): Int {',
      '    if (!valid(n)) return 0',
      '    if (n <= 0) return 1',
      '    return 2',
      '}',
    ].join('\n');

    expect(decided(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([
      '4: `n <= 0` is always false here: line 3 returns when `!valid(n)` is true, and `valid` tests `n > 0`, so the code it guards never runs',
    ]);
  });
});
