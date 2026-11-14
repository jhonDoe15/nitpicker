import { beforeAll, describe, expect, it } from 'vitest';
import { decidedConditionFindings } from '../../../../shared/rules/decided/decided-conditions.mjs';
import { javaParser, kotlinParser } from './test-support/parse-jvm.mjs';

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

describe('decided-condition on Java', () => {
  it('reports a check that an earlier guard clause decides', () => {
    const text = inClass(
      '  String size(int count) {',
      '    if (count > 10) { return "many"; }',
      '    if (count > 20) { return "lots"; }',
      '    if (count <= 10) { return "few"; }',
      '    return "none";',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `count > 20` is always false here: line 3 returns when `count > 10` is true, so the code it guards never runs',
      '5: `count <= 10` is always true here: line 3 returns when `count > 10` is true',
    ]);
  });

  it('reports the half of an && that an earlier null guard decides', () => {
    const text = inClass(
      '  boolean active(Object user, boolean flag) {',
      '    if (user == null) { throw new IllegalStateException(); }',
      '    return user != null && flag;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '4: `user != null` is always true here: line 3 throws when `user == null` is true',
    ]);
  });

  it('reports a dead arm of an else-if chain and a check inside an enclosing if', () => {
    const text = inClass(
      '  int pick(boolean a, boolean b, int n) {',
      '    if (a && b) { return 1; } else if (a) { return 2; } else if (a && n > 0) { return 3; }',
      '    if (n > 5) {',
      '      if (n > 2) { return 4; }',
      '    }',
      '    return n > 0 || n > 1 ? 5 : 6;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '3: `a && n > 0` is always false here: it is inside the `else` of the `if (a)` on line 3, so the code it guards never runs',
      '5: `n > 2` is always true here: it is inside the `if (n > 5)` on line 4',
      '7: `n > 1` is always false here: `n > 0` comes first in the same `||`',
    ]);
  });

  it('reports a check that a continue guard decides inside a loop', () => {
    const text = inClass(
      '  int total(int[] values) {',
      '    int sum = 0;',
      '    for (int value : values) {',
      '      if (value < 0) { continue; }',
      '      if (value >= 0) { sum += value; }',
      '    }',
      '    return sum;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '6: `value >= 0` is always true here: line 5 continues when `value < 0` is true',
    ]);
  });

  it('forgets what a guard knew after a write, an impure call or a loop that writes', () => {
    const text = inClass(
      '  int limit;',
      '  int clamp(int n, java.util.List<Integer> items) {',
      '    if (n > 10) { return 10; }',
      '    n = n * 2;',
      '    if (n > 10) { return 11; }',
      '    if (limit > 3) { return 3; }',
      '    items.clear();',
      '    if (limit > 3) { return 4; }',
      '    int k = 0;',
      '    if (k > 2) { return 2; }',
      '    while (items.isEmpty()) { k++; }',
      '    if (k > 2) { return 5; }',
      '    return n + 1 > n ? 1 : 0;',
      '  }',
    );

    expect(decided(text)).toEqual([]);
  });

  it('keeps one identity per condition text so line moves do not count as new', () => {
    const text = inClass(
      '  int twice(int n) {',
      '    if (n > 1) { return 1; }',
      '    if (n > 1) { return 2; }',
      '    if (n > 1) { return 3; }',
      '    return 0;',
      '  }',
    );
    const units = parsers.java(text, 'src/main/java/shop/Rules.java');
    const identities = decidedConditionFindings(units, {
      analyzerName: 'structure',
      isExcepted: () => false,
    }).map(({ identity }) => identity);

    expect(identities).toEqual([
      'decided-condition:src/main/java/shop/Rules.java#Rules.twice(int):false:n > 1#1',
      'decided-condition:src/main/java/shop/Rules.java#Rules.twice(int):false:n > 1#2',
    ]);
  });

  it('reads hex, octal, char and long literals by value and skips inexact float literals', () => {
    const text = inClass(
      '  int x;',
      '  int hex(int n) { if (n > 0xFF) { return 1; } if (n > 20) { return 2; } return 0; }',
      '  int octal(int n) { if (n < 010) { return 1; } if (n >= 9) { return 2; } return 0; }',
      "  int letter(char c) { if (c == 'a') { if (c == 97) { return 1; } } return 0; }",
      '  int single(float a) { if (a == 0.1) { return 1; } if (a == 0.1f) { return 2; } return 0; }',
      '  int wide(long a) {',
      '    if (a > 9223372036854775806L) { return 1; }',
      '    if (a > 9223372036854775807L) { return 2; }',
      '    return 0;',
      '  }',
      '  int field() { if (x > 5) { return 1; } this.x = 10; if (x > 5) { return 2; } return 0; }',
      '  int scoped(int k) {',
      '    { int n = k; k = n; }',
      '    double n = k / 3.0;',
      '    if (n <= 4) { return 1; }',
      '    if (n >= 5) { return 2; }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      "5: `c == 97` is always true here: it is inside the `if (c == 'a')` on line 5",
    ]);
  });
});

describe('decided-condition on Kotlin', () => {
  it('reports a when arm that the earlier arms or guards decide', () => {
    const text = [
      'fun size(n: Int): Int {',
      '    if (n < 0) return 0',
      '    return when {',
      '        n > 10 -> 1',
      '        n > 20 -> 2',
      '        else -> 3',
      '    }',
      '}',
    ].join('\n');

    expect(decided(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([
      '5: `n > 20` is always false here: an earlier arm takes `n > 10` (line 4), so the code it guards never runs',
    ]);
  });

  it('forgets a var that a lambda writes once a call runs', () => {
    const text = [
      'fun count(items: List<Int>): Int {',
      '    var seen = 0',
      '    if (seen > 0) return 1',
      '    items.forEach { seen += it }',
      '    if (seen > 0) return 2',
      '    return seen',
      '}',
    ].join('\n');

    expect(decided(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([]);
  });

  it('forgets a field after a member write and keeps a Double name apart from an Int one', () => {
    const text = [
      'class Rules(var x: Int) {',
      '    fun field(): Int {',
      '        if (x > 5) return 1',
      '        this.x = 10',
      '        if (x > 5) return 2',
      '        return 0',
      '    }',
      '    fun scoped(items: List<Int>, d: Double): Int {',
      '        items.forEach { d: Int -> println(d) }',
      '        if (d <= 4) return 1',
      '        if (d >= 5) return 2',
      '        return 0',
      '    }',
      '    fun hex(n: Int): Int {',
      '        if (n > 0xFF) return 1',
      '        if (n > 20) return 2',
      '        return 0',
      '    }',
      '}',
    ].join('\n');

    expect(decided(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([]);
  });
});
