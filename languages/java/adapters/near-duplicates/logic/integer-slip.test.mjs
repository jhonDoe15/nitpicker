import { beforeAll, describe, expect, it } from 'vitest';
import { integerSlipFindings } from '../../../../../shared/rules/decided/slips/integer-slips.mjs';
import { javaParser, kotlinParser } from '../test-support/parse-jvm.mjs';

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

describe('integer-slip on Java', () => {
  it('reports a difference compared with 0 and names the inputs', () => {
    const found = slips(inClass('  boolean after(int a, int b) {', '    return a - b > 0;', '  }'));

    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(
      /^3: `a - b > 0` does not compare the operands: .*a = -?\d+, b = -?\d+/u,
    );
  });

  it('reports a comparator that returns a difference', () => {
    const text = inClass(
      '  int compare(Item a, Item b) { return 0; }',
      '  int compareTo(int a, int b) {',
      '    return a - b;',
      '  }',
    );

    expect(slips(text).join('\n')).toContain('is not a valid comparison result');
  });

  it('reports Math.abs used as an index or bucket', () => {
    const text = inClass(
      '  int bucket(int hash, int n) {',
      '    return Math.abs(hash) % n;',
      '  }',
      '  int pick(int[] items, int hash) {',
      '    return items[Math.abs(hash)];',
      '  }',
    );

    expect(slips(text)).toHaveLength(2);
  });

  it('does not report differences that cannot overflow', () => {
    const text = inClass(
      '  boolean a(int a, int b) {',
      '    if (a >= 0 && a < 1000 && b >= 0 && b < 1000) { return a - b > 0; }',
      '    return false;',
      '  }',
      '  boolean b(java.util.List<String> x, java.util.List<String> y) {',
      '    return x.size() - y.size() > 0;',
      '  }',
      '  boolean c(long a, long b) { return a < b; }',
      '  int d(int hash, int n) { return Math.floorMod(hash, n); }',
      '  int e(int hash, int n) {',
      '    if (hash != Integer.MIN_VALUE) { return Math.abs(hash) % n; }',
      '    return 0;',
      '  }',
    );

    expect(slips(text)).toEqual([]);
  });

  it('leaves a remainder test to SpotBugs on Java', () => {
    expect(slips(inClass('  boolean odd(int x) {', '    return x % 2 == 1;', '  }'))).toEqual([]);
  });
});

describe('integer-slip on Kotlin', () => {
  it('reports a difference and a remainder test on a parameter', () => {
    const text = [
      'class Rules {',
      '  fun after(a: Int, b: Int): Boolean { return a - b > 0 }',
      '  fun odd(x: Int): Boolean { return x % 2 == 1 }',
      '}',
    ].join('\n');

    expect(slips(text, 'src/main/kotlin/Rules.kt')).toHaveLength(2);
  });

  it('does not report a remainder test once the value is known to be non-negative', () => {
    const text = [
      'class Rules {',
      '  fun odd(x: Int): Boolean {',
      '    if (x < 0) { return false }',
      '    return x % 2 == 1',
      '  }',
      '}',
    ].join('\n');

    expect(slips(text, 'src/main/kotlin/Rules.kt')).toEqual([]);
  });
});
