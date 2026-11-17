import { beforeAll, describe, expect, it } from 'vitest';
import { duplicateBranchFindings } from '../../../../../shared/rules/branches/duplicate-branches.mjs';
import { goParser, inPackage } from '../test-support/parse-go.mjs';

let parse;

beforeAll(async () => {
  parse = await goParser();
});

function guards(...lines) {
  return duplicateBranchFindings(parse(inPackage(...lines)), {
    analyzerName: 'facts',
    isExcepted: () => false,
  }).map(
    ({ location, message }) => `${String(location.line)}: ${message.split(/\.? If this/u)[0]}`,
  );
}

describe('guards that repeat a body, on Go', () => {
  it('merges adjacent guards that return the same value', () => {
    expect(
      guards(
        'func check(a, b *T) int {',
        '\tif a == nil {',
        '\t\treturn 1',
        '\t}',
        '\tif b == nil {',
        '\t\treturn 1',
        '\t}',
        '\treturn a.x + b.x',
        '}',
      ),
    ).toEqual([
      '4: The guards `a == nil` (line 4) and `b == nil` (line 7) have the same body. Merge them into one guard: `if a == nil || b == nil`',
    ]);
  });

  it('merges a nested if that repeats the else', () => {
    expect(
      guards(
        'func pick(a, b bool) int {',
        '\tif a {',
        '\t\tif b {',
        '\t\t\treturn 1',
        '\t\t} else {',
        '\t\t\treturn 2',
        '\t\t}',
        '\t} else {',
        '\t\treturn 2',
        '\t}',
        '}',
      ),
    ).toEqual([
      '4: The `else` on line 10 repeats the inner `else` of the `if` on line 5. Use one test, `if a && b`, for the inner branch, and keep a single `else`',
    ]);
  });
});
