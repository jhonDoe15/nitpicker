import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../patch/unified-diff.mjs';
import { labelHunks, labelOf } from './label-hunks.mjs';

function hunkAt(start) {
  return parseUnifiedDiff(`--- a\n+++ a\n@@ -${start},1 +${start},1 @@\n-x\n+y\n`)[0].hunks[0];
}

const DIAGNOSTICS = [
  { check: 'MissingOverride', line: 10 },
  { check: 'UnusedMethod', line: 30 },
  { check: 'ClassCanBeStatic', line: 31 },
];

describe('labelOf', () => {
  it.each([
    ['sits on the changed line', 10, ['MissingOverride', 'UnusedMethod'], 'MissingOverride'],
    [
      'is nearest when none sits on the line',
      25,
      ['MissingOverride', 'UnusedMethod'],
      'UnusedMethod',
    ],
    [
      'is the nearest of the checks asked for',
      31,
      ['MissingOverride', 'UnusedMethod'],
      'UnusedMethod',
    ],
  ])('names the check whose diagnostic %s', (_case, line, checks, expected) => {
    expect(labelOf(hunkAt(line), DIAGNOSTICS, checks)).toBe(expected);
  });

  it.each([
    [['MissingOverride'], 'MissingOverride'],
    [['MissingOverride', 'UnusedMethod'], undefined],
  ])('without diagnostics, falls back for the checks %j', (checks, expected) => {
    expect(labelOf(hunkAt(5), [], checks)).toBe(expected);
  });
});

describe('labelHunks', () => {
  it('drops the hunks it cannot name', () => {
    expect(labelHunks([hunkAt(5)], [], ['A', 'B'])).toEqual([]);
    expect(labelHunks([hunkAt(10)], DIAGNOSTICS, ['MissingOverride'])).toEqual([
      { label: 'MissingOverride', hunk: hunkAt(10) },
    ]);
  });
});
