import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff, type Hunk } from '../patch/unified-diff.mts';
import { labelHunks, labelOf } from './label-hunks.mts';

function hunkAt(start: number): Hunk {
  const hunk = parseUnifiedDiff(
    `--- a\n+++ a\n@@ -${String(start)},1 +${String(start)},1 @@\n-x\n+y\n`,
  )[0]?.hunks[0];
  if (hunk === undefined) {
    throw new Error('the test patch has no hunk');
  }
  return hunk;
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
      { label: 'MissingOverride', hunk: hunkAt(10), line: 10 },
    ]);
  });
});

describe('labelHunks lines', () => {
  it('carry the line of the nearest diagnostic, not the line of the hunk', () => {
    expect(labelHunks([hunkAt(25)], DIAGNOSTICS, ['UnusedMethod'])[0]?.line).toBe(30);
    expect(labelHunks([hunkAt(5)], [], ['A'])[0]).not.toHaveProperty('line');
  });
});
