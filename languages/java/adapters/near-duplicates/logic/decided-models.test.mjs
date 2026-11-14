import { beforeAll, describe, expect, it } from 'vitest';
import { decidedConditionFindings } from '../../../../../shared/rules/decided/decided-conditions.mjs';
import { javaParser, kotlinParser } from '../test-support/parse-jvm.mjs';

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
  return ['import java.util.*; class Rules {', ...lines, '}'].join('\n');
}

describe('decided-condition value models on Java', () => {
  it('knows that sizes are not negative and that isEmpty means a size of 0', () => {
    const text = inClass(
      '  int f(List<String> list, String s, int[] a, Map<String, String> m) {',
      '    if (list.isEmpty()) { return 0; }',
      '    if (list.size() == 0) { return 1; }',
      '    if (a.length < 0) { return 2; }',
      '    if (s.length() < 0) { return 3; }',
      '    return m.size() >= 0 ? 4 : 5;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `list.size() == 0` is always false here: line 3 returns when `list.isEmpty()` is true, so the code it guards never runs',
      '5: `a.length < 0` is always false here: a size or length is a whole number, never negative, so the code it guards never runs',
      '6: `s.length() < 0` is always false here: a size or length is a whole number, never negative, so the code it guards never runs',
      '7: `m.size() >= 0` is always true here: a size or length is a whole number, never negative',
    ]);
  });

  it('knows index searches return at least -1 and random numbers are below 1', () => {
    const text = inClass(
      '  boolean f(List<String> list, String s) {',
      '    if (list.indexOf("x") < -1) { return true; }',
      "    if (s.lastIndexOf('c') < -1) { return true; }",
      '    return Math.random() >= 1 ? true : list.isEmpty();',
      '  }',
    );

    expect(decided(text)).toEqual([
      '3: `list.indexOf("x") < -1` is always false here: an index search returns -1 or a position, so the code it guards never runs',
      "4: `s.lastIndexOf('c') < -1` is always false here: an index search returns -1 or a position, so the code it guards never runs",
      '5: `Math.random() >= 1` is always false here: a random number is at least 0 and below 1, so the code it guards never runs',
    ]);
  });

  it('knows an absolute value of a floating-point number is not negative, not an int one', () => {
    const text = inClass(
      '  boolean f(double d, int n) {',
      '    if (Math.abs(n) < 0) { return true; }',
      '    return Math.abs(d) < 0 ? true : n > 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `Math.abs(d) < 0` is always false here: an absolute value is never negative, so the code it guards never runs',
    ]);
  });

  it('sees the same stable call twice, a project size() on another type has no fact', () => {
    const text = inClass(
      '  int f(Box box, List<String> list, Optional<String> opt, String s) {',
      '    if (list.size() > 10) {',
      '      if (list.size() > 5) { return 1; }',
      '    }',
      '    if (opt.isPresent()) { return 2; }',
      '    if (!opt.isPresent()) { return 3; }',
      '    if (box.size() < 0) { return 4; }',
      '    return box.size() > 3 && box.size() > 2 ? 5 : 6;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `list.size() > 5` is always true here: it is inside the `if (list.size() > 10)` on line 3',
      '7: `!opt.isPresent()` is always true here: line 6 returns when `opt.isPresent()` is true',
    ]);
  });

  it('treats a same-file getter that only returns a field as stable', () => {
    const text = inClass(
      '  private int size;',
      '  private int other;',
      '  public final int getSize() { return size; }',
      '  public int getOther() { return other; }',
      '  int f(Rules box) {',
      '    if (box.getSize() > 10) {',
      '      if (box.getSize() > 5) { return 1; }',
      '    }',
      '    if (getOther() > 10) {',
      '      if (getOther() > 5) { return 2; }',
      '    }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '8: `box.getSize() > 5` is always true here: it is inside the `if (box.getSize() > 10)` on line 7',
    ]);
  });

  it('forgets a size after a call that may change the collection', () => {
    const text = inClass(
      '  int f(List<String> list) {',
      '    if (list.size() > 10) { return 1; }',
      '    list.clear();',
      '    if (list.size() <= 10) { return 2; }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([]);
  });
});

describe('decided-condition value models on Kotlin', () => {
  it('knows sizes, isEmpty, index searches and floating-point absolute values', () => {
    const text = [
      'fun f(list: List<String>, s: String, a: IntArray, d: Double): Int {',
      '    if (list.isEmpty()) return 0',
      '    if (list.size == 0) return 1',
      '    if (a.size < 0) return 2',
      '    if (s.length < 0) return 2',
      '    if (list.count() < 0) return 2',
      '    if (list.indexOf("x") < -1) return 3',
      '    if (Math.abs(d) < 0) return 3',
      '    return if (s.isNotEmpty()) 4 else 5',
      '}',
    ].join('\n');

    expect(decided(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([
      '3: `list.size == 0` is always false here: line 2 returns when `list.isEmpty()` is true, so the code it guards never runs',
      '4: `a.size < 0` is always false here: a size or length is a whole number, never negative, so the code it guards never runs',
      '5: `s.length < 0` is always false here: a size or length is a whole number, never negative, so the code it guards never runs',
      '6: `list.count() < 0` is always false here: a size or length is a whole number, never negative, so the code it guards never runs',
      '7: `list.indexOf("x") < -1` is always false here: an index search returns -1 or a position, so the code it guards never runs',
      '8: `Math.abs(d) < 0` is always false here: an absolute value is never negative, so the code it guards never runs',
    ]);
  });
});
