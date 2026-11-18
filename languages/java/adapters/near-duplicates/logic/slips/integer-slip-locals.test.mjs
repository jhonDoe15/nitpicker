import { beforeAll, describe, expect, it } from 'vitest';
import { integerSlipFindings } from '../../../../../../shared/rules/decided/slips/integer-slips.mjs';
import { javaParser, kotlinParser } from '../../test-support/parse-jvm.mts';

const parsers = {};

beforeAll(async () => {
  parsers.java = await javaParser();
  parsers.kotlin = await kotlinParser();
});

function slips(text, file = 'src/main/java/shop/Rules.java') {
  const units = parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
  return integerSlipFindings(units, { analyzerName: 'structure', isExcepted: () => false }).map(
    ({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`,
  );
}

function inClass(...lines) {
  return ['class Rules {', ...lines, '}'].join('\n');
}

describe('integer-slip keeps to inputs it knows the range of', () => {
  it('does not invent counterexamples for locals defined from bounded values', () => {
    const text = inClass(
      '  boolean a(String s, String t) {',
      '    int n = s.length();',
      '    int m = t.length();',
      '    return n - m > 0;',
      '  }',
      '  boolean b(int x, int y) {',
      '    int a = x & 0xFF;',
      '    int b = y & 0xFF;',
      '    return a - b > 0;',
      '  }',
      '  int c(int x, int n) {',
      '    int h = Math.max(0, x);',
      '    return Math.abs(h) % n;',
      '  }',
      '  int d(int i, int n) {',
      '    int j = i < 0 ? 0 : i;',
      '    return Math.abs(j) % n;',
      '  }',
      '  int e(int x, int n) {',
      '    int h = x >>> 1;',
      '    return Math.abs(h) % n;',
      '  }',
      '  int f(int[] a, int n) {',
      '    int h = a.length / 2;',
      '    return Math.abs(h) % n;',
      '  }',
      '  int g(int n) {',
      '    int k = 7 * 3;',
      '    return Math.abs(k) % n;',
      '  }',
      '  int h(int x, int n) {',
      '    x = x & 0xFF;',
      '    return Math.abs(x) % n;',
      '  }',
    );

    expect(slips(text)).toEqual([]);
  });

  it('still reports parameters that are not reassigned', () => {
    expect(slips(inClass('  int f(int h, int n) { return Math.abs(h) % n; }'))).toHaveLength(1);
  });

  it('promotes Math.abs of byte, short and char to int', () => {
    const text = inClass(
      '  int a(short i, int n) { return Math.abs(i) % n; }',
      '  int b(byte i, int n) { return Math.abs(i) % n; }',
      '  int c(char i, int n) { return Math.abs(i) % n; }',
      '  int d(int x, int n) { return Math.abs((short) x) % n; }',
    );

    expect(slips(text)).toEqual([]);
  });

  it('never reports a difference tested for equality with zero', () => {
    const text = inClass(
      '  boolean a(int x, int y) { return x - y == 0; }',
      '  boolean b(int x, int y) { return x - y != 0; }',
      '  boolean c(long x, long y) { return 0 == x - y; }',
      '  boolean d(long x, long y) { return x - y != 0L; }',
    );

    expect(slips(text)).toEqual([]);
    expect(slips('fun a(x: Long, y: Long): Boolean = x - y == 0L', 'src/Rules.kt')).toEqual([]);
    expect(slips('fun b(x: Int, y: Int): Boolean = 0 == x - y', 'src/Rules.kt')).toEqual([]);
  });
});
