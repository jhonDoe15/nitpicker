import { beforeAll, describe, expect, it } from 'vitest';
import { shorterConditionFindings } from '../../../../shared/rules/shorter/shorter-conditions.mjs';
import { javaParser, kotlinParser } from './test-support/parse-jvm.mts';

const parsers = {};

beforeAll(async () => {
  parsers.java = await javaParser();
  parsers.kotlin = await kotlinParser();
});

function shorter(text, file = 'src/main/java/shop/Rules.java') {
  const units = parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
  return shorterConditionFindings(units, {
    analyzerName: 'structure',
    isExcepted: () => false,
  }).map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

function inClass(...lines) {
  return ['class Rules {', ...lines, '}'].join('\n');
}

describe('shorter-condition on Java', () => {
  it('prints an implied operand, a complement merge and adjacent ranges', () => {
    const text = inClass(
      '  boolean both(int n) { return n > 3 && n > 5; }',
      '  boolean either(int n) { return n > 5 || n > 3; }',
      '  boolean same(boolean a, boolean b) { return (a && b) || (a && !b); }',
      '  boolean span(int x) { return (x >= 0 && x < 10) || (x >= 10 && x < 20); }',
      '  boolean consensus(boolean a, boolean b, boolean c) { return b && c || a && b || !a && c; }',
    );

    expect(shorter(text)).toEqual([
      '2: `n > 3 && n > 5` can be written as `n > 5`: `n > 5` later in the same `&&` implies it',
      '3: `n > 5 || n > 3` can be written as `n > 3`: it implies `n > 3` later in the same `||`',
      '4: `(a && b) || (a && !b)` can be written as `a`: `a && b` and `a && !b` of the same `||` merge into one',
      '5: `(x >= 0 && x < 10) || (x >= 10 && x < 20)` can be written as `x >= 0 && x < 20`: `x >= 0 && x < 10` and `x >= 10 && x < 20` of the same `||` merge into one',
      '6: `b && c || a && b || !a && c` can be written as `a && b || !a && c`: the other operands of the `||` already cover it',
    ]);
  });

  it('keeps a guard in front of the member read it protects', () => {
    const text = inClass(
      '  boolean big(String s) { return s != null && s.length() > 3 && s.length() > 5; }',
      '  boolean open(String s, int i) { return s != null && (s.length() > 3 || s.length() < 1); }',
    );

    expect(shorter(text)).toEqual([
      '2: `s != null && s.length() > 3 && s.length() > 5` can be written as `s != null && s.length() > 5`: `s.length() > 5` later in the same `&&` implies it',
    ]);
  });

  it('leaves floats, calls with effects, long conditions and unguarded reads alone', () => {
    const text = inClass(
      '  boolean flt(double x) { return x < 5 || x >= 5; }',
      '  boolean nan(double x) { return !(x < 5) && x < 7; }',
      '  boolean call(Rules r) { return r.next() > 3 && r.next() > 5; }',
      '  int next() { return 1; }',
      '  boolean many(boolean a, boolean b, boolean c, boolean d, boolean e, boolean f, boolean g) {',
      '    return (a && b) || (a && !b) || c || d || e || f || g;',
      '  }',
      '  boolean unguarded(String s) { return s.length() > 3 && s.length() > 5; }',
      '  boolean consensus(boolean a, boolean b, boolean c) { return a && b || !a && c || b && c; }',
      '  boolean decided(int n) { return n > 5 && n > 3; }',
    );

    expect(shorter(text)).toEqual([]);
  });
});

describe('shorter-condition on chained comparisons', () => {
  it('names the operand each reason drops when there is more than one', () => {
    const text = inClass(
      '  boolean one(int x) { return x >= 2 && x < 8 && x == 3 && x != 5; }',
      '  boolean two(int x) { return x > 3 || x > 2 || x > 1; }',
    );

    expect(shorter(text)).toEqual([
      '2: `x >= 2 && x < 8 && x == 3 && x != 5` can be written as `x == 3 && x != 5`: `x == 3` later in the same `&&` implies `x >= 2`; `x == 3` later in the same `&&` implies `x < 8`',
      '3: `x > 3 || x > 2 || x > 1` can be written as `x > 1`: `x > 3` implies `x > 2` later in the same `||`; `x > 2` implies `x > 1` later in the same `||`',
    ]);
  });
});

describe('shorter-condition on Kotlin', () => {
  it('prints an implied operand and merges ranges', () => {
    const text = [
      'class Rules {',
      '  fun both(n: Int): Boolean = n > 3 && n > 5',
      '  fun span(x: Int): Boolean = (x >= 0 && x < 10) || (x >= 10 && x < 20)',
      '  fun guard(s: String?): Boolean = s != null && s.length > 3 && s.length > 5',
      '  fun flt(x: Double): Boolean = x < 5 || x >= 5',
      '}',
    ].join('\n');

    expect(shorter(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([
      '2: `n > 3 && n > 5` can be written as `n > 5`: `n > 5` later in the same `&&` implies it',
      '3: `(x >= 0 && x < 10) || (x >= 10 && x < 20)` can be written as `x >= 0 && x < 20`: `x >= 0 && x < 10` and `x >= 10 && x < 20` of the same `||` merge into one',
      '4: `s != null && s.length > 3 && s.length > 5` can be written as `s != null && s.length > 5`: `s.length > 5` later in the same `&&` implies it',
    ]);
  });
});
