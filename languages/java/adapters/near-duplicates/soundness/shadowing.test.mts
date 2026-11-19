import { beforeAll, describe, expect, it } from 'vitest';
import { KOTLIN_FILE, decidedRunner, type Decided } from '../test-support/decided-runner.mts';

let decided: Decided;

beforeAll(async () => {
  decided = await decidedRunner();
});

const POS = 'fun pos(x: Int) = x > 0';

describe('decided-condition on Kotlin names that shadow a helper or a precondition', () => {
  it('does not inline a top-level helper behind a local function or a parameter of the same name', () => {
    const text = [
      POS,
      'fun g(n: Int): Int { fun pos(x: Int) = x < 0; if (pos(n)) { if (n >= 0) { return 1 } }; return 0 }',
      'fun h(n: Int, pos: (Int) -> Boolean): Int { if (pos(n)) { if (n <= 0) { return 1 } }; return 0 }',
      'fun i(n: Int): Int { val pos = { x: Int -> x < 0 }; if (pos(n)) { if (n >= 0) { return 1 } }; return 0 }',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([]);
  });

  it('inlines the top-level helper when nothing shadows it', () => {
    const text = [POS, 'fun d(n: Int): Int { if (pos(n)) { if (n <= 0) { return 1 } }; return 0 }'];

    expect(decided(text.join('\n'), KOTLIN_FILE)).toEqual([
      '2: `n <= 0` is always false here: it is inside the `if (pos(n))` on line 2, and `pos` tests `x > 0`, so the code it guards never runs',
    ]);
  });

  it('does not read require as the standard library check when the project defines or imports one', () => {
    const own = [
      'fun require(b: Boolean) { }',
      'fun a(x: Int): Int { require(x > 0); if (x > 0) { return 1 }; return 0 }',
    ];
    const imported = [
      'import com.acme.require',
      'fun a(x: Int): Int { require(x > 0); if (x > 0) { return 1 }; return 0 }',
    ];
    const parameter = [
      'fun a(x: Int, require: (Boolean) -> Unit): Int { require(x > 0); if (x > 0) { return 1 }; return 0 }',
    ];

    expect(decided(own.join('\n'), KOTLIN_FILE)).toEqual([]);
    expect(decided(imported.join('\n'), KOTLIN_FILE)).toEqual([]);
    expect(decided(parameter.join('\n'), KOTLIN_FILE)).toEqual([]);
  });

  it('keeps the standard library require as a guard', () => {
    const text = 'fun a(x: Int): Int { require(x > 0); if (x > 0) { return 1 }; return 0 }';

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '1: `x > 0` is always true here: line 1 throws unless `x > 0`',
    ]);
  });
});
