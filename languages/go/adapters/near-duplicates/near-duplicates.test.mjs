import { beforeAll, describe, expect, it } from 'vitest';
import { findNearDuplicates } from '../../../../shared/near-duplicates/engine.mjs';
import { nearDuplicateFindings } from '../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import { goParser, inPackage } from './test-support/parse-go.mjs';

let parse;

beforeAll(async () => {
  parse = await goParser();
});

function messages(...lines) {
  return nearDuplicateFindings(parse(inPackage(...lines)), {
    analyzerName: 'facts',
    isExcepted: () => false,
    roleOf: () => 'production',
  }).map(({ message }) => message.split('. ')[0]);
}

function verdicts(...lines) {
  return findNearDuplicates(parse(inPackage(...lines))).map(({ verdict, proof, units }) => ({
    verdict,
    proof,
    units: units.map((id) => id.slice(id.lastIndexOf('#') + 1)),
  }));
}

const SIZE_LABEL = [
  'func sizeLabel(count, limit int) string {',
  '\tif count < 0 {',
  '\t\treturn "negative"',
  '\t}',
  '\tif count > limit*2 {',
  '\t\treturn "lots"',
  '\t}',
  '\tif count > limit {',
  '\t\treturn "many"',
  '\t}',
  '\tif count == 0 {',
  '\t\treturn "none"',
  '\t}',
  '\treturn "few"',
  '}',
];

const SIZE_NAME = [
  'func sizeName(amount, max int) string {',
  '\tif amount < 0 {',
  '\t\treturn "negative"',
  '\t}',
  '\tif amount > max && amount <= max*2 {',
  '\t\treturn "many"',
  '\t}',
  '\tif amount > max*2 {',
  '\t\treturn "lots"',
  '\t}',
  '\tif amount == 0 {',
  '\t\treturn "none"',
  '\t}',
  '\treturn "few"',
  '}',
];

const SUMS = [
  'func SumInts(xs []int) int { t := 0; for _, x := range xs { if x > 0 { t += x } else { t -= 1 } }; for _, y := range xs { if y > 9 { t += y } }; return t }',
  'func SumFloats(xs []float64) float64 { t := 0.0; for _, x := range xs { if x > 0 { t += x } else { t -= 1 } }; for _, y := range xs { if y > 9 { t += y } }; return t }',
  'func SumLongs(xs []int64) int64 { t := int64(0); for _, x := range xs { if x > 0 { t += x } else { t -= 1 } }; for _, y := range xs { if y > 9 { t += y } }; return t }',
];

describe('near-duplicate on Go', () => {
  it('proves two functions the same when only the way their logic is written differs', () => {
    expect(verdicts(...SIZE_LABEL, ...SIZE_NAME)).toEqual([
      { verdict: 'same', proof: 'logic', units: ['sizeName(int,int)', 'sizeLabel(int,int)'] },
    ]);
  });

  it('names the copy and the way it differs', () => {
    expect(messages(...SIZE_LABEL, ...SIZE_NAME)).toEqual([
      'sizeName(int,int) is a copy of sizeLabel(int,int) (pkg/rules.go:3) apart from how its logic is written (a solver proved both give the same results)',
    ]);
  });

  it('does not pair a function with one whose logic differs', () => {
    const swapped = SIZE_NAME.join('\n')
      .replace('amount > max && amount <= max*2', 'amount > max')
      .replace('sizeName', 'sizeSwapped')
      .split('\n');

    expect(verdicts(...SIZE_LABEL, ...swapped)).toEqual([]);
  });

  it('skips copies that only differ by the number type, as the JVM primitive families', () => {
    expect(messages(...SUMS)).toEqual([]);
  });

  it('still reports a copy that differs by a number', () => {
    const above = SUMS[0].replace('SumInts', 'SumAbove').replace('y > 9', 'y > 5');

    expect(messages(SUMS[0], above)).toEqual([
      'SumInts([]int) is a copy of SumAbove([]int) (pkg/rules.go:4) apart from 1 value (9 / 5)',
    ]);
  });
});
