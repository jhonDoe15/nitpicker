import { describe, expect, it } from 'vitest';
import { findingsOf, source } from '../../test-support/reuse-project.mjs';

function slips(files) {
  return findingsOf(files)
    .filter(({ rule }) => rule === 'result-slip')
    .map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`)
    .toSorted();
}

describe('result-slip on TypeScript and JavaScript', () => {
  it('reports localeCompare tested against a non-zero value and indexOf tested with > 0', () => {
    const found = slips({
      'src/sort/order.ts': source(
        'export function order(a: string, b: string, list: string[]): number {',
        '  if (a.localeCompare(b) === 1) {',
        '    return 1;',
        '  }',
        '  if (list.indexOf(a) > 0) {',
        '    return 2;',
        '  }',
        '  return 0;',
        '}',
      ),
    });

    expect(found).toEqual([
      '2: `a.localeCompare(b) === 1` compares a sign-only result with a value other than 0: `localeCompare` may return any positive or negative number',
      '5: `list.indexOf(a) > 0` misses a match at position 0, because `indexOf` returns 0 for it and -1 for none',
    ]);
  });

  it('accepts a comparison with 0, a presence test with >= 0 and a sign test with > 0', () => {
    const found = slips({
      'src/sort/order.ts': source(
        'export function order(a: string, b: string, list: string[]): number {',
        '  if (a.localeCompare(b) > 0 || a.localeCompare(b) === 0 || a.localeCompare(b) >= 1) {',
        '    return 1;',
        '  }',
        '  return list.indexOf(a) >= 0 && list.indexOf(b) !== -1 && list.indexOf(a) > 1 ? 2 : 0;',
        '}',
      ),
    });

    expect(found).toEqual([]);
  });
});
