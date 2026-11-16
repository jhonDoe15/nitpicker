import { beforeAll, describe, expect, it } from 'vitest';
import { resultSlipFindings } from '../../../../../shared/rules/slips/slip-findings.mjs';
import { javaParser, kotlinParser } from '../test-support/parse-jvm.mts';

const parsers = {};

beforeAll(async () => {
  parsers.java = await javaParser();
  parsers.kotlin = await kotlinParser();
});

function slips(text, file) {
  const units = parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
  return resultSlipFindings(units, { analyzerName: 'structure', isExcepted: () => false }).map(
    ({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`,
  );
}

describe('result-slip on Java', () => {
  it('reports a list indexOf tested with > 0 and keeps a String and compareTo to other tools', () => {
    const text = [
      'class Rules {',
      '  int f(List<String> list, String s, Comparable<String> c) {',
      '    if (list.indexOf("a") > 0) { return 1; }',
      '    if (list.indexOf("a") >= 0 || list.lastIndexOf("b") != -1) { return 2; }',
      '    if (s.indexOf("a") > 0) { return 3; }',
      '    if (c.compareTo("x") == 1) { return 4; }',
      '    if (0 < list.lastIndexOf("a")) { return 5; }',
      '    return 0;',
      '  }',
      '}',
    ].join('\n');

    expect(slips(text, 'src/main/java/shop/Rules.java')).toEqual([
      '3: `list.indexOf("a") > 0` misses a match at position 0, because `indexOf` returns 0 for it and -1 for none',
      '7: `0 < list.lastIndexOf("a")` misses a match at position 0, because `lastIndexOf` returns 0 for it and -1 for none',
    ]);
  });
});

describe('result-slip on Kotlin', () => {
  it('reports compareTo and compare against non-zero values and indexOf tested with > 0', () => {
    const text = [
      'fun f(a: String, b: String, list: List<String>, cmp: Comparator<String>): Int {',
      '    if (a.compareTo(b) == 1) return 1',
      '    if (cmp.compare(a, b) == -1) return 2',
      '    if (a.compareTo(b) > 1) return 3',
      '    if (a.compareTo(b) > 0 || a.compareTo(b) == 0 || a.compareTo(b) >= 1) return 4',
      '    if (list.indexOf(a) > 0) return 5',
      '    if (a.indexOf("x") >= 1) return 6',
      '    return if (list.indexOf(a) >= 0) 7 else 8',
      '}',
    ].join('\n');

    expect(slips(text, 'src/main/kotlin/shop/Rules.kt')).toEqual([
      '2: `a.compareTo(b) == 1` compares a sign-only result with a value other than 0: `compareTo` may return any positive or negative number',
      '3: `cmp.compare(a, b) == -1` compares a sign-only result with a value other than 0: `compare` may return any positive or negative number',
      '4: `a.compareTo(b) > 1` compares a sign-only result with a value other than 0: `compareTo` may return any positive or negative number',
      '6: `list.indexOf(a) > 0` misses a match at position 0, because `indexOf` returns 0 for it and -1 for none',
      '7: `a.indexOf("x") >= 1` misses a match at position 0, because `indexOf` returns 0 for it and -1 for none',
    ]);
  });
});
