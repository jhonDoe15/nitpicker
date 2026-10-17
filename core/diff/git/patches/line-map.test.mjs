import { describe, expect, it } from 'vitest';
import { parseChangedLines } from './changed-lines.mjs';
import { baseLineOf, canMapLines } from './line-map.mjs';

const changed = parseChangedLines(
  [
    'diff --git a/src/a.py b/src/a.py',
    '--- a/src/a.py',
    '+++ b/src/a.py',
    '@@ -1 +1,5 @@',
    '@@ -3,12 +7,12 @@',
    '@@ -20,3 +23,0 @@',
  ].join('\n'),
).get('src/a.py');

describe('mapping a head line back to the base', () => {
  it('maps an unchanged line through the hunks before it and none for a changed line', () => {
    expect([6, 19, 22, 23, 30].map((line) => baseLineOf(changed, line))).toEqual([
      2, 15, 18, 19, 29,
    ]);
    expect([1, 5, 7, 18].map((line) => baseLineOf(changed, line))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('keeps the line of an untouched file and maps nothing without hunks or in an added file', () => {
    expect(baseLineOf(undefined, 12)).toBe(12);
    expect(canMapLines({ added: false, ranges: [] })).toBe(false);
    expect(baseLineOf({ added: true, ranges: [], hunks: [] }, 3)).toBeUndefined();
  });
});
