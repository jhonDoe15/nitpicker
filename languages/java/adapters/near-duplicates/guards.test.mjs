import { beforeAll, describe, expect, it } from 'vitest';
import { duplicateBranchFindings } from '../../../../shared/rules/branches/duplicate-branches.mjs';
import { javaParser, kotlinParser } from './test-support/parse-jvm.mts';

const parsers = {};

beforeAll(async () => {
  parsers.java = await javaParser();
  parsers.kotlin = await kotlinParser();
});

function guards(text, file = 'src/main/java/shop/Rules.java') {
  const units = parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
  return duplicateBranchFindings(units, {
    analyzerName: 'structure',
    isExcepted: () => false,
  }).map(
    ({ location, classification, message }) =>
      `${String(location.line)} ${classification}: ${message.split(' If ')[0]}`,
  );
}

function inClass(...lines) {
  return ['class Rules {', ...lines, '}'].join('\n');
}

describe('guards that repeat a body, in Java', () => {
  it('merges adjacent guards with one body into `a || b`, as report-only', () => {
    const text = inClass(
      '  Result find(Order order, int limit) {',
      '    if (order == null) {',
      '      return Result.empty();',
      '    }',
      '    if (order.items().isEmpty()) {',
      '      return Result.empty();',
      '    }',
      '    if (limit < 0 && order.isClosed()) { return Result.empty(); }',
      '    return Result.of(order);',
      '  }',
    );

    expect(guards(text)).toEqual([
      '3 descriptive: The guards `order == null` (line 3), `order.items().isEmpty()` (line 6) and `limit < 0 && order.isClosed()` (line 9) have the same body. Merge them into one guard: `if (order == null || order.items().isEmpty() || limit < 0 && order.isClosed())`.',
    ]);
  });

  it('treats guards whose bodies differ only in a renamed local as equal', () => {
    const text = inClass(
      '  int scale(int n, boolean a, boolean b) {',
      '    if (a) { int x = n * 2; return x; }',
      '    if (b) { int y = n * 2; return y; }',
      '    return n;',
      '  }',
    );

    expect(guards(text)).toEqual([
      '3 descriptive: The guards `a` (line 3) and `b` (line 4) have the same body. Merge them into one guard: `if (a || b)`.',
    ]);
  });

  it('skips guards with different bodies, a side-effecting later condition and a body without a jump', () => {
    const text = inClass(
      '  int f(Queue q, int n, boolean a, boolean b) {',
      '    if (a) { return 1; }',
      '    if (b) { return 2; }',
      '    if (n > 3) { return 3; }',
      '    if (q.poll() != null) { return 3; }',
      '    if (a) { log(n); }',
      '    if (b) { log(n); }',
      '    return 0;',
      '  }',
      '  void log(int n) {}',
    );

    expect(guards(text)).toEqual([]);
  });

  it('suggests `a && b` for an if whose inner else repeats the outer else', () => {
    const text = inClass(
      '  void run(boolean a, boolean b) {',
      '    if (a) {',
      '      if (b) { go(); } else { stop(); }',
      '    } else {',
      '      stop();',
      '    }',
      '  }',
      '  void go() {}',
      '  void stop() {}',
    );

    expect(guards(text)).toEqual([
      '3 descriptive: The `else` on line 5 repeats the inner `else` of the `if` on line 4. Use one test, `if (a && b)`, for the inner branch, and keep a single `else`.',
    ]);
  });

  it('suggests `a && !b` when the repeated body is the inner then arm', () => {
    const text = inClass(
      '  void run(boolean a, boolean b) {',
      '    if (a || b) {',
      '      if (b) { stop(); } else { go(); }',
      '    } else {',
      '      stop();',
      '    }',
      '  }',
      '  void go() {}',
      '  void stop() {}',
    );

    expect(guards(text)).toEqual([
      '3 descriptive: The `else` on line 5 repeats the inner `else` of the `if` on line 4. Use one test, `if ((a || b) && !b)`, for the inner branch, and keep a single `else`.',
    ]);
  });

  it('skips nested ifs whose else bodies differ and else-if chains that duplicate-branch already reports', () => {
    const text = inClass(
      '  void run(boolean a, boolean b) {',
      '    if (a) {',
      '      if (b) { go(); } else { stop(); }',
      '    } else {',
      '      go2();',
      '    }',
      '    if (a) {',
      '      stop();',
      '    } else if (b) {',
      '      go();',
      '    } else {',
      '      stop();',
      '    }',
      '  }',
      '  void go() {}',
      '  void go2() {}',
      '  void stop() {}',
    );

    expect(guards(text)).toEqual([
      '12 enforceable: The arms for `a` (line 8) and `else` (line 12) have the same body. Merge them into one arm, or change the arm that was meant to differ.',
    ]);
  });
});

describe('guards that repeat a body, in Kotlin', () => {
  it('merges adjacent guards and nested ifs', () => {
    const text = [
      'class Rules {',
      '  fun find(order: Order?, flag: Boolean, other: Boolean): Int {',
      '    if (order == null) {',
      '      return 0',
      '    }',
      '    if (order.items.isEmpty()) {',
      '      return 0',
      '    }',
      '    if (flag) {',
      '      if (other) { return 1 } else { return 2 }',
      '    } else {',
      '      return 2',
      '    }',
      '  }',
      '}',
    ].join('\n');

    expect(guards(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([
      '3 descriptive: The guards `order == null` (line 3) and `order.items.isEmpty()` (line 6) have the same body. Merge them into one guard: `if (order == null || order.items.isEmpty())`.',
      '9 descriptive: The `else` on line 11 repeats the inner `else` of the `if` on line 10. Use one test, `if (flag && other)`, for the inner branch, and keep a single `else`.',
    ]);
  });
});
