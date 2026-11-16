import { beforeAll, describe, expect, it } from 'vitest';
import { resultSlipFindings } from '../../../../../../shared/rules/slips/slip-findings.mjs';
import { javaParser, kotlinParser } from '../../test-support/parse-jvm.mts';

const parsers = {};

beforeAll(async () => {
  parsers.java = await javaParser();
  parsers.kotlin = await kotlinParser();
});

function slips(text, file) {
  const units = parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
  return resultSlipFindings(units, { analyzerName: 'structure', isExcepted: () => false }).map(
    ({ location }) => location.line,
  );
}

const JAVA = 'src/main/java/shop/Rules.java';
const KOTLIN = 'src/main/kotlin/shop/Rules.kt';

describe('result-slip index searches that handle position 0', () => {
  it('does not report a list search whose condition also reads the first element', () => {
    const text = [
      'class Rules {',
      '  boolean a(List<String> l, String x) { return l.indexOf(x) > 0 || l.get(0).equals(x); }',
      '  boolean b(List<String> l, String x) { return l.indexOf(x) == 0 || l.indexOf(x) > 0; }',
      '  boolean c(List<String> l, String x) { return l.indexOf(x) > 0; }',
      '}',
    ].join('\n');

    expect(slips(text, JAVA)).toEqual([4]);
  });

  it('applies the same rule to Kotlin strings and lists', () => {
    const text = [
      'fun a(l: List<String>, x: String): Boolean = l.indexOf(x) > 0 || l[0] == x',
      'fun b(s: String): Boolean = s.indexOf("@") > 0 || s.first() == \'@\'',
      'fun c(s: String): Boolean = s.indexOf("@") > 0',
    ].join('\n');

    expect(slips(text, KOTLIN)).toEqual([3]);
  });
});

describe('result-slip sign-only results', () => {
  it('reports only library comparisons, not project functions named compare', () => {
    const text = [
      'fun a(a: Foo, b: Foo): Boolean = compare(a, b) == 1',
      'fun compare(a: Foo, b: Foo): Int = if (a.v < b.v) -1 else if (a.v > b.v) 1 else 0',
      'fun b(a: Foo, b: Foo): Boolean = Integer.compare(a.v, b.v) == 1',
      'fun c(a: Foo, b: Foo): Boolean = a.compareTo(b) == 1',
      'fun d(a: Foo, b: Foo): Boolean = compareValues(a.v, b.v) == 1',
      'fun e(a: Foo, c: Comparator<Foo>, b: Foo): Boolean = c.compare(a, b) == 1',
      'fun f(a: Foo, c: Mine, b: Foo): Boolean = c.compare(a, b) == 1',
    ].join('\n');

    expect(slips(text, KOTLIN)).toEqual([4, 5, 6]);
  });
});
