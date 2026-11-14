import { beforeAll, describe, expect, it } from 'vitest';
import { KOTLIN_FILE, decidedRunner, inClass } from '../test-support/decided-runner.mjs';

let decided;

beforeAll(async () => {
  decided = await decidedRunner();
});

describe('decided-condition on Java reference identity', () => {
  it('does not read == on strings as equals', () => {
    const text = inClass(
      '  int f(String s) {',
      '    if (s == "a") { return 1; }',
      '    if (s.equals("a")) { return 2; }',
      '    return 3;',
      '  }',
      '  int g(String s) {',
      '    if (s.equals("a")) { if (s == "a") { return 1; } }',
      '    return 2;',
      '  }',
      '  boolean h(String p, String q) { return p.equals("a") && q.equals("a") && p != q; }',
    );

    expect(decided(text)).toEqual([]);
  });

  it('does not read == on boxed values as value equality', () => {
    const text = inClass(
      '  boolean f(Integer x) { Integer y = 1000; if (x == y) { return true; } return false; }',
      '  boolean g(Integer p, Integer q) { return p == 1000 && q == 1000 && p != q; }',
      '  int h(Integer a, Integer b) { if (a == b) { return 1; } if (a == 1000) { return 2; } return 3; }',
    );

    expect(decided(text)).toEqual([]);
  });

  it('keeps decisions for primitives, null and an unchanged identity test', () => {
    const text = inClass(
      '  int f(int a) { if (a == 3) { return 1; } if (a == 3) { return 2; } return 3; }',
      '  int g(Object o) { if (o == null) { return 1; } if (o != null) { return 2; } return 3; }',
      '  int h(String s, String t) { if (s == t) { return 1; } if (s == t) { return 2; } return 3; }',
    );

    expect(decided(text)).toEqual([
      '2: `a == 3` is always false here: line 2 returns when `a == 3` is true, so the code it guards never runs',
      '3: `o != null` is always true here: line 3 returns when `o == null` is true',
      '4: `s == t` is always false here: line 4 returns when `s == t` is true, so the code it guards never runs',
    ]);
  });
});

describe('decided-condition on Kotlin identity and equals', () => {
  it('does not read === as equals', () => {
    const text = [
      'fun a(x: String): Int { if (x === "a") { return 1 }; if (x == "a") { return 2 }; return 0 }',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([]);
  });

  it('does not decide equals on Any between 0.0 and -0.0 or 0', () => {
    const text = [
      'fun e(x: Any): Int { if (x == 0.0) { return 1 }; if (x == -0.0) { return 2 }; return 0 }',
      'fun f(x: Any): Int { if (x == 0.0) { return 1 }; if (x == 0) { return 2 }; return 0 }',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([]);
  });
});

describe('decided-condition on float comparisons', () => {
  it('rounds an int literal beside a float before comparing', () => {
    const text = inClass(
      '  int f(float v) { if (v == 16777217) { if (v == 16777216) { return 1; } } return 2; }',
    );

    expect(decided(text)).toEqual([]);
  });
});
