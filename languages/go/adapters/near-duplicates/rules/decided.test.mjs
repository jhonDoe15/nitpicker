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

describe('decided-condition on Go', () => {
  it('reports a check that an earlier guard clause decides, and says which one', () => {
    expect(
      decided(
        'func size(count int) string {',
        '\tif count > 10 {',
        '\t\treturn "many"',
        '\t}',
        '\tif count > 20 {',
        '\t\treturn "lots"',
        '\t}',
        '\treturn "few"',
        '}',
      ),
    ).toEqual([
      '7: `count > 20` is always false here: line 4 returns when `count > 10` is true, so the code it guards never runs',
    ]);
  });

  it('learns from if err != nil only about err', () => {
    expect(
      decided(
        'func load(path string, n int) error {',
        '\tdata, err := read(path)',
        '\tif err != nil {',
        '\t\treturn err',
        '\t}',
        '\tif n > 0 && err != nil {',
        '\t\treturn nil',
        '\t}',
        '\tif data == nil {',
        '\t\treturn nil',
        '\t}',
        '\treturn nil',
        '}',
      ),
    ).toEqual([
      '8: `n > 0 && err != nil` is always false here: line 5 returns when `err != nil` is true, so the code it guards never runs',
    ]);
  });

  it('treats the variable of an if init statement as a different one from an outer variable', () => {
    expect(
      decided(
        'func check(err error, x int) int {',
        '\tif err := run(); err != nil {',
        '\t\treturn 1',
        '\t}',
        '\tif err != nil {',
        '\t\treturn 2',
        '\t}',
        '\t{',
        '\t\tx := 5',
        '\t\tif x > 3 {',
        '\t\t\treturn x',
        '\t\t}',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual(['12: `x > 3` is always true here: `x` is set to `5` on line 11']);
  });

  it('uses the cases of a switch without a tag, in order', () => {
    expect(
      decided(
        'func rank(a int) int {',
        '\tswitch {',
        '\tcase a > 5:',
        '\t\treturn 1',
        '\tcase a > 7:',
        '\t\treturn 2',
        '\tcase a <= 5:',
        '\t\treturn 3',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual([
      '7: `a > 7` is always false here: an earlier arm takes `a > 5` (line 5), so the code it guards never runs',
      '9: `a <= 5` is always true here: an earlier arm takes `a > 5` (line 5)',
    ]);
  });

  it('counts Go fixed-width integers as integers and other numbers as reals', () => {
    expect(
      decided(
        'func both(x int, y int64, f float64, u uint8, v MyInt) int {',
        '\tif x > 3 && x < 4 {',
        '\t\treturn 1',
        '\t}',
        '\tif y > 3 && y < 4 {',
        '\t\treturn 2',
        '\t}',
        '\tif f > 3 && f < 4 {',
        '\t\treturn 3',
        '\t}',
        '\tif v > 3 && v < 4 {',
        '\t\treturn 4',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual([
      '4: `x < 4` is always false here: `x > 3` comes first in the same `&&`',
      '7: `y < 4` is always false here: `y > 3` comes first in the same `&&`',
    ]);
  });

  it('forgets what it knew after a write, a swap, a captured write or an address taken', () => {
    expect(
      decided(
        'func forget(a, b, n, m, c int) int {',
        '\tif a > b {',
        '\t\treturn 1',
        '\t}',
        '\ta, b = b, a',
        '\tif a > b {',
        '\t\treturn 2',
        '\t}',
        '\tif n > 0 {',
        '\t\treturn 3',
        '\t}',
        '\tset := func() { n = 5 }',
        '\tset()',
        '\tif n > 0 {',
        '\t\treturn 4',
        '\t}',
        '\tif m > 0 {',
        '\t\treturn 5',
        '\t}',
        '\tp := &m',
        '\t*p = 5',
        '\tif m > 0 {',
        '\t\treturn 6',
        '\t}',
        '\treturn c',
        '}',
      ),
    ).toEqual([]);
  });

  it('forgets a name a method is called on, since the method may take its address', () => {
    expect(
      decided(
        'func count(c Counter, d *Counter, n int) int {',
        '\tif c > 0 {',
        '\t\treturn 1',
        '\t}',
        '\tc.Inc()',
        '\tif c > 0 {',
        '\t\treturn 2',
        '\t}',
        '\tif n > 0 {',
        '\t\treturn 3',
        '\t}',
        '\td.Inc()',
        '\tif n > 0 {',
        '\t\treturn 4',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual([
      '15: `n > 0` is always false here: line 11 returns when `n > 0` is true, so the code it guards never runs',
    ]);
  });

  it('keeps a fact about a local when a call that cannot reach it runs', () => {
    expect(
      decided(
        'func keep(n int, p *int) int {',
        '\tif n > 0 {',
        '\t\treturn 1',
        '\t}',
        '\thelper(p)',
        '\tif n > 0 {',
        '\t\treturn 2',
        '\t}',
        '\treturn 0',
        '}',
      ),
    ).toEqual([
      '8: `n > 0` is always false here: line 4 returns when `n > 0` is true, so the code it guards never runs',
    ]);
  });

  it('uses the condition of a for loop that only runs while it holds', () => {
    expect(
      decided(
        'func spin(n int) int {',
        '\tfor n < 3 {',
        '\t\tif n < 5 {',
        '\t\t\tn++',
        '\t\t}',
        '\t}',
        '\treturn n',
        '}',
      ),
    ).toEqual(['5: `n < 5` is always true here: the loop on line 4 only runs while `n < 3`']);
  });

  it('does not read a function with a goto or a syntax error', () => {
    expect(
      decided(
        'func jump(n int) int {',
        '\tif n > 0 {',
        '\t\treturn 1',
        '\t}',
        'again:',
        '\tif n > 0 {',
        '\t\tgoto again',
        '\t}',
        '\treturn 0',
        '}',
        'func broken(n int) int {',
        '\tif n > 0 { return',
        '}',
      ),
    ).toEqual([]);
  });
});
