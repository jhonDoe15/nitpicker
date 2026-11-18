import { beforeAll, describe, expect, it } from 'vitest';
import { KOTLIN_FILE, decidedRunner, inClass } from '../test-support/decided-runner.mjs';

let decided;

beforeAll(async () => {
  decided = await decidedRunner();
});

describe('decided-condition: loops, conditionals, lambdas and equals on Java', () => {
  it('uses the test of a counted for loop inside its body', () => {
    const text = inClass(
      '  int f(int n) {',
      '    for (int i = 0; i < n; i++) { if (i >= n) { return 1; } }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '3: `i >= n` is always false here: the loop on line 3 only runs while `i < n`, so the code it guards never runs',
    ]);
  });

  it('forgets a loop test the body can break', () => {
    const text = inClass(
      '  int f(int n) {',
      '    for (int i = 0; i < n; i++) { n = n - 1; if (i >= n) { return 1; } }',
      '    return 0;',
      '  }',
    );

    expect(decided(text)).toEqual([]);
  });

  it('uses the test of a conditional expression in its branches', () => {
    const text = inClass(
      '  int f(int x) {',
      '    int a = x > 5 ? (x > 3 ? 1 : 2) : 3;',
      '    int b = x > 5 ? 1 : (x > 7 ? 2 : 3);',
      '    return a + b;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '3: `x > 3` is always true here: it is in the true branch of the conditional `x > 5` on line 3',
      '4: `x > 7` is always false here: it is in the false branch of the conditional `x > 5` on line 4, so the code it guards never runs',
    ]);
  });

  it('carries facts about names that cannot change into lambdas', () => {
    const text = inClass(
      '  java.util.function.Supplier<Integer> f(int n) {',
      '    if (n > 5) { return () -> n > 3 ? 1 : 0; }',
      '    return null;',
      '  }',
      '  void g(int n, java.util.List<Integer> list) {',
      '    if (n > 5) { list.forEach(x -> { if (n > 4) { System.out.println(x); } }); }',
      '  }',
    );

    expect(decided(text)).toEqual([
      '3: `n > 3` is always true here: it is inside the `if (n > 5)` on line 3',
      '7: `n > 4` is always true here: it is inside the `if (n > 5)` on line 7',
    ]);
  });

  it('keeps no fact for a changing name, a field or a shadowed parameter in a lambda', () => {
    const text = inClass(
      '  int limit;',
      '  java.util.function.Supplier<Integer> f(int n) {',
      '    if (limit > 5) { return () -> limit > 3 ? 1 : 0; }',
      '    if (n > 5) { return () -> n > 3 ? 1 : 0; }',
      '    return null;',
      '  }',
      '  java.util.function.IntFunction<Integer> g(int n) {',
      '    if (n > 5) { return (int m) -> m > 3 ? 1 : 0; }',
      '    return null;',
      '  }',
    );
    const changing = inClass(
      '  java.util.function.Supplier<Integer> h(int n) {',
      '    if (n > 5) { n = 1; }',
      '    return () -> n > 3 ? 1 : 0;',
      '  }',
    );

    expect(decided(text)).toEqual([
      '5: `n > 3` is always true here: it is inside the `if (n > 5)` on line 5',
    ]);
    expect(decided(changing)).toEqual([]);
  });

  it('reads equals on strings, enum constants and boxed literals as value equality', () => {
    const text = inClass(
      '  int f(String s, Integer count, Object o) {',
      '    if ("a".equals(s)) {',
      '      if (java.util.Objects.equals(s, "b")) { return 1; }',
      '      if (s.equals("a")) { return 2; }',
      '    }',
      '    if (count.equals(5)) { if (count.equals(6)) { return 3; } }',
      '    if (o.equals(5)) { if (o.equals(6)) { return 4; } }',
      '    return 0;',
      '  }',
    );
    const imported = [
      'import java.util.Objects;',
      inClass(
        '  int f(String s) {',
        '    if (Objects.equals(s, "a")) { if (Objects.equals(s, "b")) { return 1; } }',
        '    return 0;',
        '  }',
      ),
    ].join('\n');

    expect(decided(text)).toEqual([
      '5: `s.equals("a")` is always true here: it is inside the `if ("a".equals(s))` on line 3',
      '7: `count.equals(6)` is always false here: it is inside the `if (count.equals(5))` on line 7, so the code it guards never runs',
    ]);
    expect(decided(imported)).toEqual([
      '4: `Objects.equals(s, "b")` is always false here: it is inside the `if (Objects.equals(s, "a"))` on line 4, so the code it guards never runs',
    ]);
  });
});

describe('decided-condition: loops, conditionals, lambdas and equals on Kotlin', () => {
  it('uses until, .. and downTo ranges as loop facts', () => {
    const text = [
      'fun f(n: Int): Int {',
      '    for (i in 0 until n) { if (i >= n) return 1 }',
      '    for (i in 1..n) { if (i < 1) return 2 }',
      '    for (i in n downTo 0) { if (i > n) return 3 }',
      '    for (i in 0 until n step 2) { if (i >= n) return 4 }',
      '    return 0',
      '}',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '2: `i >= n` is always false here: the loop on line 2 only runs for `i` in `0 until n`, so the code it guards never runs',
      '3: `i < 1` is always false here: the loop on line 3 only runs for `i` in `1..n`, so the code it guards never runs',
      '4: `i > n` is always false here: the loop on line 4 only runs for `i` in `n downTo 0`, so the code it guards never runs',
    ]);
  });

  it('uses a ..< range as an exclusive loop bound', () => {
    const text = [
      'fun f(n: Int): Int {',
      '    for (i in 0..<n) { if (i >= n) return 1 }',
      '    for (i in 0..<n) { if (i < 0) return 2 }',
      '    for (i in 0..<n) { if (i == n - 1) return 3 }',
      '    return 0',
      '}',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '2: `i >= n` is always false here: the loop on line 2 only runs for `i` in `0..<n`, so the code it guards never runs',
      '3: `i < 0` is always false here: the loop on line 3 only runs for `i` in `0..<n`, so the code it guards never runs',
    ]);
  });

  it('forgets a range bound the loop body changes', () => {
    const text = [
      'fun f(n0: Int): Int {',
      '    var n = n0',
      '    for (i in 0 until n) { n = 3; if (i >= n) return 1 }',
      '    return 0',
      '}',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([]);
  });

  it('uses the test of an if expression and carries facts into lambdas', () => {
    const text = [
      'fun f(n: Int, list: List<Int>): Int {',
      '    val a = if (n > 5) (if (n > 3) 1 else 2) else 3',
      '    if (n > 5) { list.forEach { println(if (n > 4) 1 else 2) } }',
      '    var m = n',
      '    if (m > 5) { list.forEach { m += it; println(if (m > 4) 1 else 2) } }',
      '    return a',
      '}',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '2: `n > 3` is always true here: it is in the true branch of the conditional `n > 5` on line 2',
      '3: `n > 4` is always true here: it is inside the `if (n > 5)` on line 3',
    ]);
  });

  it('reads == and equals on strings as value equality', () => {
    const text = [
      'fun f(s: String): Int {',
      '    if (s == "a") { if (s == "b") return 1 }',
      '    if (s.equals("c")) { if (s.equals("d")) return 2 }',
      '    return 0',
      '}',
    ].join('\n');

    expect(decided(text, KOTLIN_FILE)).toEqual([
      '2: `s == "b"` is always false here: it is inside the `if (s == "a")` on line 2, so the code it guards never runs',
      '3: `s.equals("d")` is always false here: it is inside the `if (s.equals("c"))` on line 3, so the code it guards never runs',
    ]);
  });
});
