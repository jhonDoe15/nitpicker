import { beforeAll, describe, expect, it } from 'vitest';
import { KOTLIN_FILE, decidedRunner, inClass } from '../test-support/decided-runner.mjs';

let decided;

beforeAll(async () => {
  decided = await decidedRunner();
});

describe('decided-condition: precondition calls and assertions', () => {
  it('reads library calls by their import and assert as a guard', () => {
    const text = [
      'import java.util.Objects;',
      'import com.google.common.base.Preconditions;',
      'import static org.springframework.util.Assert.isTrue;',
      inClass(
        '  int f(Object order, int n, int k) {',
        '    Objects.requireNonNull(order);',
        '    if (order == null) { return 1; }',
        '    Preconditions.checkArgument(n > 0, "n");',
        '    if (n <= 0) { return 2; }',
        '    isTrue(k > 4);',
        '    if (k <= 4) { return 3; }',
        '    assert n > 1;',
        '    if (n > 1) { return 4; }',
        '    if (n <= 1) { return 5; }',
        '    return 0;',
        '  }',
      ),
    ].join('\n');

    expect(decided(text)).toEqual([
      '7: `order == null` is always false here: line 6 throws unless `order != null`, so the code it guards never runs',
      '9: `n <= 0` is always false here: line 8 throws unless `n > 0`, so the code it guards never runs',
      '11: `k <= 4` is always false here: line 10 throws unless `k > 4`, so the code it guards never runs',
      '13: `n > 1` is always true here: the assert on line 12 already states this, and assertions may be off at run time',
    ]);
  });

  it('does not read a same-named project helper or an unimported library as a guard', () => {
    const text = [
      'import com.shop.Preconditions;',
      inClass(
        '  int f(Object order, Object other, int n) {',
        '    Preconditions.checkArgument(n > 0);',
        '    if (n <= 0) { return 1; }',
        '    Objects.requireNonNull(order);',
        '    if (order == null) { return 2; }',
        '    requireNonNull(other);',
        '    if (other == null) { return 3; }',
        '    return 0;',
        '  }',
      ),
    ].join('\n');

    expect(decided(text)).toEqual([]);
  });

  it('reads require, check and requireNotNull in Kotlin but not a project function of that name', () => {
    const text = [
      'package shop',
      'fun f(n: Int, o: Any?): Int {',
      '    require(n > 0)',
      '    if (n <= 0) return 1',
      '    requireNotNull(o)',
      '    if (o == null) return 2',
      '    check(n > 1)',
      '    if (n <= 1) return 3',
      '    assert(n > 2)',
      '    if (n > 2) return 4',
      '    return 0',
      '}',
    ].join('\n');
    const shadowed = [
      'package shop',
      'fun require(c: Boolean) {}',
      'fun g(n: Int): Int { require(n > 0); if (n <= 0) return 1; return 0 }',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '4: `n <= 0` is always false here: line 3 throws unless `n > 0`, so the code it guards never runs',
      '6: `o == null` is always false here: line 5 throws unless `o != null`, so the code it guards never runs',
      '8: `n <= 1` is always false here: line 7 throws unless `n > 1`, so the code it guards never runs',
      '10: `n > 2` is always true here: the assert on line 9 already states this, and assertions may be off at run time',
    ]);
    expect(decided(shadowed, KOTLIN_FILE)).toEqual([]);
  });
});
