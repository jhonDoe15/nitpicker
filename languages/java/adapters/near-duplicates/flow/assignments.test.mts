import { beforeAll, describe, expect, it } from 'vitest';
import {
  KOTLIN_FILE,
  decidedRunner,
  inClass,
  type Decided,
} from '../test-support/decided-runner.mts';

let decided: Decided;

beforeAll(async () => {
  decided = await decidedRunner();
});

describe('decided-condition: values from assignments on Java', () => {
  it('learns a literal declaration, a re-assignment and a final constant', () => {
    const text = inClass(
      '  int f(int n, String label) {',
      '    int retries = 0;',
      '    if (retries == 0) { n = 1; }',
      '    String mode = "a";',
      '    mode = "b";',
      '    if (mode.equals("a")) { n = 2; }',
      '    final int limit = 10;',
      '    if (n > limit) { return 1; }',
      '    if (label == null) { return 2; }',
      '    String copy = label;',
      '    if (copy == null) { return 3; }',
      '    return n;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `retries == 0` is always true here: `retries` is set to `0` on line 3',
      '7: `mode.equals("a")` is always false here: `mode` is set to `"b"` on line 6, so the code it guards never runs',
      '12: `copy == null` is always false here: the conditions before it decide it together, so the code it guards never runs',
    ]);
  });

  it('forgets the value after a write, in a loop, through a lambda or for a field', () => {
    const text = inClass(
      '  int count;',
      '  int f(int n, java.util.List<Integer> items) {',
      '    int a = 0;',
      '    a = n;',
      '    if (a == 0) { return 1; }',
      '    int b = 0;',
      '    while (n > 0) { if (b == 0) { n--; } b = n; }',
      '    int c = 0;',
      '    for (int i = 0; i < n; i++) { c += i; }',
      '    if (c == 0) { return 2; }',
      '    count = 0;',
      '    reset();',
      '    if (count == 0) { return 3; }',
      '    double d = 0.5;',
      '    double e = d;',
      '    if (e == 0.5) { return 4; }',
      '    return 0;',
      '  }',
      '  void reset() { count = 5; }',
    );

    expect(decided(text)).toEqual([]);
  });
});

describe('decided-condition: values from assignments on Kotlin', () => {
  it('learns val and var literals and forgets a var a lambda writes', () => {
    const text = [
      'fun f(items: List<Int>): Int {',
      '    val x = 0',
      '    if (x == 0) return 1',
      '    var y = 1',
      '    y = 2',
      '    if (y == 1) return 2',
      '    var seen = 0',
      '    items.forEach { seen += it }',
      '    if (seen > 0) return 3',
      '    return 0',
      '}',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '3: `x == 0` is always true here: `x` is set to `0` on line 2',
      '6: `y == 1` is always false here: `y` is set to `2` on line 5, so the code it guards never runs',
    ]);
  });
});
