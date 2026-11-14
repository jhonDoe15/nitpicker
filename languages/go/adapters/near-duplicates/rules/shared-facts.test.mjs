import { beforeAll, describe, expect, it } from 'vitest';
import { decidedConditionFindings } from '../../../../../shared/rules/decided/decided-conditions.mjs';
import { goParser, inPackage } from '../test-support/parse-go.mjs';

let parse;

beforeAll(async () => {
  parse = await goParser();
});

function decided(...lines) {
  return decidedConditionFindings(parse(inPackage(...lines)), {
    analyzerName: 'facts',
    isExcepted: () => false,
  }).map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe('the shared decided-condition facts on Go', () => {
  it('learns the label of a tagged switch arm', () => {
    expect(
      decided(
        'func f(k int) int {',
        '\tswitch k {',
        '\tcase 1:',
        '\t\tif k == 1 {',
        '\t\t\treturn 1',
        '\t\t}',
        '\tdefault:',
        '\t\tif k == 1 {',
        '\t\t\treturn 2',
        '\t\t}',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual([
      '6: `k == 1` is always true here: it is in the `case 1` arm of the `switch` on line 4',
      '10: `k == 1` is always false here: it is not `case 1` of the `switch` on line 4, so the code it guards never runs',
    ]);
  });

  it('learns the value a local was just set to', () => {
    expect(
      decided(
        'func f() int {',
        '\tn := 0',
        '\tif n > 0 {',
        '\t\treturn 1',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual([
      '5: `n > 0` is always false here: `n` is set to `0` on line 4, so the code it guards never runs',
    ]);
  });

  it('learns the test of a counted loop', () => {
    expect(
      decided(
        'func f() int {',
        '\tfor i := 0; i < 10; i++ {',
        '\t\tif i < 10 {',
        '\t\t\treturn 1',
        '\t\t}',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual(['5: `i < 10` is always true here: the loop on line 4 only runs while `i < 10`']);
  });

  it('knows that a length is never negative, for len and cap', () => {
    expect(
      decided(
        'func f(x []int, m map[string]int) int {',
        '\tif len(x) < 0 || cap(x) < 0 {',
        '\t\treturn 1',
        '\t}',
        '\treturn len(m)',
        '}',
      ),
    ).toEqual([
      '4: `len(x) < 0 || cap(x) < 0` is always false here: a size or length is a whole number, never negative, so the code it guards never runs',
    ]);
  });

  it('does not trust a len that the file shadows', () => {
    expect(
      decided(
        'func f(x []int) int {',
        '\tlen := func(v []int) int { return -1 }',
        '\tif len(x) < 0 {',
        '\t\treturn 1',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual([]);
  });
});

describe('Go fixed-width integers decided with bit-vectors', () => {
  it('wraps a signed integer around and keeps an int 64 bits wide', () => {
    expect(
      decided(
        'func f(big int) int {',
        '\tvar small int8 = 127',
        '\tn := 0',
        '\tif small+1 > small {',
        '\t\treturn 1',
        '\t}',
        '\tif n+1 > 0 && big+0 == big {',
        '\t\treturn 2',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual([
      '6: `small+1 > small` is always false here: `small` is set to `127` on line 4, so the code it guards never runs',
      '9: `n+1 > 0 && big+0 == big` is always true here: `n` is set to `0` on line 5',
    ]);
  });

  it('compares unsigned integers as unsigned and does not promote narrow ones', () => {
    expect(
      decided(
        'func f(n uint32, b uint8, w int8) int {',
        '\tif n > 3000000000 && n < 5 {',
        '\t\treturn 1',
        '\t}',
        '\tif b+1 > b {',
        '\t\treturn 2',
        '\t}',
        '\tif int16(w) < -200 {',
        '\t\treturn 3',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual(['4: `n < 5` is always false here: `n > 3000000000` comes first in the same `&&`']);
  });
});
