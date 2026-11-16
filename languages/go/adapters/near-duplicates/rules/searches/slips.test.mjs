import { beforeAll, describe, expect, it } from 'vitest';
import { integerSlipFindings } from '../../../../../../shared/rules/decided/slips/integer-slips.mjs';
import { resultSlipFindings } from '../../../../../../shared/rules/slips/slip-findings.mjs';
import { goParser, inPackage } from '../../test-support/parse-go.mjs';

let parse;

beforeAll(async () => {
  parse = await goParser();
});

function found(rule, lines) {
  return rule(parse(inPackage(...lines)), { analyzerName: 'facts', isExcepted: () => false }).map(
    ({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`,
  );
}

describe('result-slip on Go', () => {
  it('reports an index search tested with > 0 and keeps >= 0, != -1 and a handled first index', () => {
    expect(
      found(resultSlipFindings, [
        'func pick(s, x string, items []string) bool {',
        '\tif strings.Index(s, x) > 0 {',
        '\t\treturn true',
        '\t}',
        '\tif strings.LastIndexByte(s, 1) <= 0 {',
        '\t\treturn true',
        '\t}',
        '\tif slices.Index(items, x) >= 1 {',
        '\t\treturn true',
        '\t}',
        '\tif strings.Index(s, x) >= 0 || strings.Index(s, x) != -1 {',
        '\t\treturn true',
        '\t}',
        '\treturn bytes.Index(nil, nil) > 0',
        '}',
      ]),
    ).toEqual([
      '4: `strings.Index(s, x) > 0` misses a match at position 0, because `Index` returns 0 for it and -1 for none',
      '7: `strings.LastIndexByte(s, 1) <= 0` misses a match at position 0, because `LastIndexByte` returns 0 for it and -1 for none',
      '10: `slices.Index(items, x) >= 1` misses a match at position 0, because `Index` returns 0 for it and -1 for none',
      '16: `bytes.Index(nil, nil) > 0` misses a match at position 0, because `Index` returns 0 for it and -1 for none',
    ]);
  });

  it('does not report a search of a project function, or one whose first index is handled', () => {
    expect(
      found(resultSlipFindings, [
        'func pick(s, x string, finder Finder) bool {',
        '\treturn finder.Index(s) > 0',
        '}',
        'func first(s, x string) bool {',
        '\treturn strings.Index(s, x) > 0 || s[0] == x[0]',
        '}',
        'func second(s, x string) bool {',
        '\treturn strings.Index(s, x) == 0 || strings.Index(s, x) > 0',
        '}',
      ]),
    ).toEqual([]);
  });
});

describe('integer-slip on Go', () => {
  it('reports a difference of signed or unsigned integers compared by order and a remainder test', () => {
    const lines = found(integerSlipFindings, [
      'func after(a, b int64) bool {',
      '\treturn a-b > 0',
      '}',
      'func before(a, b uint32) bool {',
      '\treturn a-b < 0',
      '}',
      'func odd(x int) bool {',
      '\treturn x%2 == 1',
      '}',
    ]);

    expect(lines.map((line) => line.replaceAll(/ = -?\d+/gu, ' = N'))).toEqual([
      '4: `a-b > 0` does not compare the operands: the subtraction overflows for a = N, b = N',
      '7: `a-b < 0` does not compare the operands: the subtraction overflows for a = N, b = N',
      '10: `x%2 == 1` never matches a negative value, whose remainder is negative: x = N',
    ]);
  });

  it('does not report what cannot wrap or is not an integer', () => {
    expect(
      found(integerSlipFindings, [
        'func a(a, b int64) bool { return a-b == 0 }',
        'func b(a, b uint8) bool { return a%2 == 1 }',
        'func c(x, y []int) bool { return len(x)-len(y) > 0 }',
        'func d(a, b float64) bool { return a-b > 0 }',
        'func e(a, b int64) bool { return a < b }',
        'func f(a int64, b int32) bool { x := a & 0xFF; return x-a > 0 }',
        'func g(x float64, n int) int { return int(math.Abs(x)) % n }',
        'func h(a, b int) bool {',
        '\tif a >= 0 && a < 1000 && b >= 0 && b < 1000 {',
        '\t\treturn a-b > 0',
        '\t}',
        '\treturn false',
        '}',
      ]),
    ).toEqual([]);
  });
});
