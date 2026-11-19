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

describe('decided-condition: assignment and arm facts with value models', () => {
  it('decides arithmetic on a local that was just set', () => {
    const text = inClass(
      '  boolean f() {',
      '    int n = 0;',
      '    if (n + 1 > 0) { return true; }',
      '    return false;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `n + 1 > 0` is always true here: `n` is set to `0` on line 3',
    ]);
  });

  it('decides sizes inside a switch arm', () => {
    const text = inClass(
      '  int f(int kind, java.util.List<String> list) {',
      '    switch (kind) {',
      '      case 1: if (kind == 1 && list.size() >= 0) { return 1; } break;',
      '      default: if (list.size() < 0) { return 2; }',
      '    }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `kind == 1 && list.size() >= 0` is always true here: it is in the `case 1` arm of the `switch` on line 3',
      '5: `list.size() < 0` is always false here: a size or length is a whole number, never negative, so the code it guards never runs',
    ]);
  });

  it('wraps around after an assignment', () => {
    const text = inClass(
      '  boolean f() {',
      '    int n = 2147483647;',
      '    if (n + 1 > n) { return true; }',
      '    return false;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `n + 1 > n` is always false here: `n` is set to `2147483647` on line 3, so the code it guards never runs',
    ]);
  });

  it('decides the same on Kotlin', () => {
    const text =
      'fun f(): Boolean {\n  val n: Int = 0\n  if (n + 1 > 0) { return true }\n  return false\n}\n';
    expect(decided(text, KOTLIN_FILE)).toEqual([
      '3: `n + 1 > 0` is always true here: `n` is set to `0` on line 2',
    ]);
  });
});
