import { beforeAll, describe, expect, it } from 'vitest';
import { KOTLIN_FILE, decidedRunner, inClass } from '../test-support/decided-runner.mjs';

let decided;

beforeAll(async () => {
  decided = await decidedRunner();
});

describe('decided-condition: switch arms on Java', () => {
  it('learns the label in a case and the other labels in default', () => {
    const text = inClass(
      '  int f(int n) {',
      '    switch (n) {',
      '      case 1: if (n == 1) { return 1; } break;',
      '      case 2: case 3: if (n == 5) { return 2; } break;',
      '      default: if (n == 1) { return 3; }',
      '    }',
      '    return switch (n) { case 7 -> n == 7 ? 1 : 0; default -> n == 7 ? 2 : 3; };',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `n == 1` is always true here: it is in the `case 1` arm of the `switch` on line 3',
      '5: `n == 5` is always false here: it is in the `case 2, 3` arm of the `switch` on line 3, so the code it guards never runs',
      '6: `n == 1` is always false here: it is not `case 1` of the `switch` on line 3, so the code it guards never runs',
      '8: `n == 7` is always true here: it is in the `case 7` arm of the `switch` on line 8',
      '8: `n == 7` is always false here: it is not `case 7` of the `switch` on line 8, so the code it guards never runs',
    ]);
  });

  it('learns string and enum labels', () => {
    const text = inClass(
      '  int f(String s, State st) {',
      '    switch (s) { case "a": if (s.equals("b")) { return 1; } break; default: break; }',
      '    switch (st) {',
      '      case A: if (st == State.B) { return 2; } break;',
      '      case B: return 3;',
      '      default: if (st == State.A) { return 4; }',
      '    }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '3: `s.equals("b")` is always false here: it is in the `case "a"` arm of the `switch` on line 3, so the code it guards never runs',
      '5: `st == State.B` is always false here: it is in the `case A` arm of the `switch` on line 4, so the code it guards never runs',
      '7: `st == State.A` is always false here: it is not `case A` of the `switch` on line 4, so the code it guards never runs',
    ]);
  });

  it('reports a case label that a guard makes unreachable', () => {
    const text = inClass(
      '  int f(int n) {',
      '    if (n > 0) { switch (n) { case -1: return 1; case 2: return 2; default: return 3; } }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '3: `n == -1` is always false here: it is inside the `if (n > 0)` on line 3, so the code it guards never runs',
    ]);
  });

  it('gives no fact to fall-through, pattern, guarded or computed arms', () => {
    const text = inClass(
      '  int f(int n, Object o, int[] a) {',
      '    switch (n) { case 1: n++; case 2: if (n == 2) { return 1; } break; default: break; }',
      '    switch (n) { case 1: n = 3; break; default: if (n == 3) { return 2; } }',
      '    switch (o) { case String s when s.length() > 1 -> { if (o == null) { return 3; } } default -> { } }',
      '    switch (a[0]) { case 1: if (a[0] == 2) { return 4; } break; default: break; }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([]);
  });
});

describe('decided-condition: when arms on Kotlin', () => {
  it('learns the label of a when arm and the labels it excludes', () => {
    const text = [
      'fun f(n: Int, s: String): Int {',
      '    when (n) { 1 -> if (n == 1) 1 else 2; 2, 3 -> if (n == 4) 4 else 5; else -> if (n == 2) 9 else 8 }',
      '    when { n > 5 -> if (n > 3) 1 else 2; else -> 0 }',
      '    return when (s) { "a" -> if (s == "b") 1 else 2; else -> 3 }',
      '}',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '2: `n == 1` is always true here: it is in the `case 1` arm of the `when` on line 2',
      '2: `n == 4` is always false here: it is in the `case 2, 3` arm of the `when` on line 2, so the code it guards never runs',
      '2: `n == 2` is always false here: it is not `case 2` of the `when` on line 2, so the code it guards never runs',
      '3: `n > 3` is always true here: it is in the `n > 5` arm of the `when` on line 3',
      '4: `s == "b"` is always false here: it is in the `case "a"` arm of the `when` on line 4, so the code it guards never runs',
    ]);
  });
});
