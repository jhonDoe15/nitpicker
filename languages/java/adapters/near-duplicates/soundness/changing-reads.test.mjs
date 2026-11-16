import { beforeAll, describe, expect, it } from 'vitest';
import { KOTLIN_FILE, decidedRunner, inClass } from '../test-support/decided-runner.mjs';

let decided;

beforeAll(async () => {
  decided = await decidedRunner();
});

describe('decided-condition on reads that another thread or a getter can change', () => {
  it('does not decide a second read of a volatile field', () => {
    const text = inClass(
      '  volatile boolean v;',
      '  int f() { if (v) { return 1; } if (v) { return 2; } return 3; }',
      '  int g() { v = true; if (v) { return 1; } return 2; }',
      '  int h(Rules o) { if (o.v) { return 1; } if (o.v) { return 2; } return 3; }',
    );

    expect(decided(text)).toEqual([]);
  });

  it('keeps deciding a second read of a plain field and a getter of a plain field', () => {
    const text = inClass(
      '  boolean w;',
      '  boolean getW() { return w; }',
      '  int f() { if (w) { return 1; } if (w) { return 2; } return 3; }',
    );

    expect(decided(text)).toEqual([
      '4: `w` is always false here: line 4 returns when `w` is true, so the code it guards never runs',
    ]);
  });

  it('does not treat a getter of a volatile field as stable', () => {
    const text = inClass(
      '  volatile int n;',
      '  int getN() { return n; }',
      '  int f(Rules o) { if (o.getN() > 5) { return 1; } if (o.getN() > 7) { return 2; } return 3; }',
    );

    expect(decided(text)).toEqual([]);
  });

  it('does not decide a second read of a Kotlin property with a custom getter or a volatile one', () => {
    const text = [
      'class K {',
      '  var n = 0',
      '  val g: Int get() = n++',
      '  @Volatile var flag = false',
      '  val d: Int by java.util.concurrent.atomic.AtomicInteger()::get',
      '  fun f(): Int { if (g > 5) { return 1 }; if (g > 7) { return 2 }; return 3 }',
      '  fun h(): Int { if (flag) { return 1 }; if (flag) { return 2 }; return 3 }',
      '}',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([]);
  });

  it('keeps deciding a plain Kotlin property read twice', () => {
    const text = [
      'class K {',
      '  var n = 0',
      '  fun f(): Int { if (n > 5) { return 1 }; if (n > 7) { return 2 }; return 3 }',
      '}',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '3: `n > 7` is always false here: line 3 returns when `n > 5` is true, so the code it guards never runs',
    ]);
  });
});
