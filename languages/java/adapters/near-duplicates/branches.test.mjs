import { beforeAll, describe, expect, it } from 'vitest';
import { duplicateBranchFindings } from '../../../../shared/rules/branches/duplicate-branches.mjs';
import { javaParser, kotlinParser } from './test-support/parse-jvm.mjs';

const parsers = {};

beforeAll(async () => {
  parsers.java = await javaParser();
  parsers.kotlin = await kotlinParser();
});

function branches(text, file = 'src/main/java/shop/Rules.java') {
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

describe('duplicate-branch on Java', () => {
  it('reports else-if arms that differ only in a renamed local, not ones that differ in a literal', () => {
    const text = inClass(
      '  int scale(int n, boolean wide, boolean tall) {',
      '    if (wide) {',
      '      int doubled = n * 2;',
      '      return doubled + 1;',
      '    } else if (tall) {',
      '      int twice = n * 2;',
      '      return twice + 1;',
      '    } else if (n > 9) {',
      '      int twice = n * 2;',
      '      return twice + 2;',
      '    }',
      '    return n;',
      '  }',
    );

    expect(branches(text)).toEqual([
      '6 enforceable: The arms for `wide` (line 3) and `tall` (line 6) have the same body. Merge them into one arm, or change the arm that was meant to differ.',
    ]);
  });

  it('reports switch cases with the same body, but not a case that falls through', () => {
    const text = inClass(
      '  String label(int code) {',
      '    switch (code) {',
      '      case 1:',
      '        audit(code);',
      '        return "low";',
      '      case 2:',
      '        audit(code);',
      '      case 4:',
      '        return "mid";',
      '      case 3:',
      '        audit(code);',
      '        return "low";',
      '      default:',
      '        return "high";',
      '    }',
      '  }',
      '  void audit(int code) {}',
    );

    expect(branches(text)).toEqual([
      '11 enforceable: The cases on lines 4 and 11 have the same body. Merge their labels into one case, or change the case that was meant to differ.',
    ]);
  });

  it('leaves a two-arm if/else and a ternary to Error Prone DuplicateBranches', () => {
    const text = inClass(
      '  int same(int n, boolean flag) {',
      '    if (flag) { return n + 1; } else { return n + 1; }',
      '  }',
      '  int pick(int n, boolean flag) {',
      '    return flag ? n : n;',
      '  }',
    );

    expect(branches(text)).toEqual([]);
  });

  it('reports, as report-only, statements every arm starts or ends with when moving them is safe', () => {
    const text = inClass(
      '  void save(String name, boolean draft) {',
      '    if (draft) {',
      '      log(name);',
      '      store(name, 0);',
      '      flush();',
      '    } else {',
      '      log(name);',
      '      publish(name);',
      '      flush();',
      '    }',
      '  }',
      '  void count(int n, boolean draft) {',
      '    if (n > 0) {',
      '      n = n - 1;',
      '      int left = n;',
      '      store("a", left);',
      '    } else {',
      '      n = n - 1;',
      '      int left = n;',
      '      store("b", left);',
      '    }',
      '  }',
      '  void log(String name) {}',
      '  void store(String name, int n) {}',
      '  void publish(String name) {}',
      '  void flush() {}',
    );

    expect(branches(text)).toEqual([
      '3 descriptive: Every arm of the `if` on line 3 starts with the same statement. Move it before the `if`.',
      '3 descriptive: Every arm of the `if` on line 3 ends with the same statement. Move it after the `if`.',
    ]);
  });

  it('skips a case that an earlier case falls into and cases that match a type', () => {
    const text = inClass(
      '  int code(int n) {',
      '    switch (n) {',
      '      case 1:',
      '        audit(n);',
      '        break;',
      '      case 5:',
      '        flush();',
      '      case 2:',
      '        audit(n);',
      '        break;',
      '      default:',
      '        break;',
      '    }',
      '    return n;',
      '  }',
      '  double area(Shape o) {',
      '    return switch (o) {',
      '      case Circle c -> c.area();',
      '      case Square c -> c.area();',
      '      default -> 0.0;',
      '    };',
      '  }',
      '  void audit(int n) {}',
      '  void flush() {}',
    );

    expect(branches(text)).toEqual([]);
  });
});

describe('duplicate-branch on Kotlin', () => {
  it('reports equal when arms and an if/else whose two arms are the same', () => {
    const text = [
      'fun label(code: Int): String = when (code) {',
      '    1 -> "low"',
      '    2 -> "mid"',
      '    3 -> "low"',
      '    else -> "high"',
      '}',
      '',
      'fun sign(n: Int, strict: Boolean): Int {',
      '    if (strict) {',
      '        println(n)',
      '        return n * 2',
      '    } else {',
      '        println(n)',
      '        return n * 2',
      '    }',
      '}',
    ].join('\n');

    expect(branches(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([
      '4 enforceable: The cases on lines 2 and 4 have the same body. Merge their labels into one case, or change the case that was meant to differ.',
      '12 enforceable: The arms for `strict` (line 9) and `else` (line 12) have the same body. Merge them into one arm, or change the arm that was meant to differ.',
    ]);
  });

  it('keeps arms apart when a lambda local hides the outer variable or a type test picks the arm', () => {
    const text = [
      'fun shadow(a: Boolean, x: Int, y: Int) {',
      '    if (a) {',
      '        println(x)',
      '        run { val x = 1; println(x) }',
      '    } else if (y > 1) {',
      '        println(y)',
      '        run { val y = 1; println(y) }',
      '    } else {',
      '        println(0)',
      '    }',
      '}',
      '',
      'fun area(o: Any): Double {',
      '    if (o is Circle) {',
      '        return o.area()',
      '    } else if (o is Square) {',
      '        return o.area()',
      '    }',
      '    return when (o) {',
      '        is Circle -> o.area()',
      '        is Square -> o.area()',
      '        else -> 0.0',
      '    }',
      '}',
    ].join('\n');

    expect(branches(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([]);
  });
});
