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

function insertionAfter(line: number): Hunk {
  const hunk = parseUnifiedDiff(
    `--- a\n+++ a\n@@ -${String(line)},1 +${String(line)},2 @@\n x\n+y\n`,
  )[0]?.hunks[0];
  if (hunk === undefined) {
    throw new Error('the test patch has no hunk');
  }
  return hunk;
}

function hunkChanging(first: number, last: number): Hunk {
  const middle = ' m\n'.repeat(last - first - 1);
  const count = String(last - first + 1);
  const hunk = parseUnifiedDiff(
    `--- a\n+++ a\n@@ -${String(first)},${count} +${String(first)},${count} @@\n-a\n+b\n${middle}-c\n+d\n`,
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
    expect(labelHunks([hunkAt(5)], [], { checks: ['A', 'B'] })).toEqual([]);
    expect(labelHunks([hunkAt(10)], DIAGNOSTICS, { checks: ['MissingOverride'] })).toEqual([
      { label: 'MissingOverride', hunk: hunkAt(10), line: 10 },
    ]);
  });
});

describe('labelHunks lines', () => {
  it('carry the line of the nearest diagnostic, not the line of the hunk', () => {
    expect(labelHunks([hunkAt(25)], DIAGNOSTICS, { checks: ['UnusedMethod'] })[0]?.line).toBe(30);
    expect(labelHunks([hunkAt(5)], [], { checks: ['A'] })[0]).not.toHaveProperty('line');
  });
});

describe('labelHunks spans', () => {
  const SPAN = [{ check: 'SaveInLoop', line: 12, endLine: 40 }, ...DIAGNOSTICS];
  const SPANNED = new Set(['SaveInLoop']);

  it('gives every hunk inside a multi-line fix the same label, line and group', () => {
    const labeled = labelHunks([hunkAt(12), hunkAt(25), hunkAt(40)], SPAN, {
      checks: ['SaveInLoop'],
      spanChecks: SPANNED,
    });

    expect(labeled.map(({ label, line, group }) => [label, line, group])).toEqual([
      ['SaveInLoop', 12, 'SaveInLoop:12'],
      ['SaveInLoop', 12, 'SaveInLoop:12'],
      ['SaveInLoop', 12, 'SaveInLoop:12'],
    ]);
  });

  it('leaves a hunk outside the span, or on another check line, to the nearest diagnostic', () => {
    const checks = ['SaveInLoop', 'UnusedMethod'];
    const labeled = labelHunks([hunkAt(41), hunkAt(30)], SPAN, {
      checks: checks,
      spanChecks: SPANNED,
    });

    expect(labeled.map(({ label, group }) => [label, group])).toEqual([
      ['UnusedMethod', undefined],
      ['UnusedMethod', undefined],
    ]);
  });

  it('counts lines added right before or after the span as part of it', () => {
    const hunks = [insertionAfter(11), insertionAfter(40), insertionAfter(41)];
    const labeled = labelHunks(hunks, SPAN, { checks: ['SaveInLoop'], spanChecks: SPANNED });

    expect(labeled.map(({ group }) => group)).toEqual([
      'SaveInLoop:12',
      'SaveInLoop:12',
      undefined,
    ]);
  });

  it('groups only the checks it is told to', () => {
    expect(labelHunks([hunkAt(25)], SPAN, { checks: ['SaveInLoop'] })[0]).not.toHaveProperty(
      'group',
    );
  });
});

describe('labelHunks spans among other fixes', () => {
  const SPANNED = new Set(['SaveInLoop', 'LogConcat', 'Regex', 'Sort']);
  const checks = [...SPANNED];

  it('leaves a one-line fix inside a span to the check reported on that line', () => {
    const diagnostics = [
      { check: 'SaveInLoop', line: 10, endLine: 30 },
      { check: 'LogConcat', line: 20 },
    ];
    const labeled = labelHunks([hunkAt(10), hunkAt(20), hunkAt(30)], diagnostics, {
      checks: checks,
      spanChecks: SPANNED,
    });

    expect(labeled.map(({ label, group }) => [label, group])).toEqual([
      ['SaveInLoop', 'SaveInLoop:10'],
      ['LogConcat', undefined],
      ['SaveInLoop', 'SaveInLoop:10'],
    ]);
  });

  it('joins a hunk that sticks out of a span to that span', () => {
    const diagnostics = [
      { check: 'Sort', line: 9, endLine: 30 },
      { check: 'Regex', line: 8 },
    ];
    const labeled = labelHunks([hunkChanging(8, 10), hunkAt(29)], diagnostics, {
      checks: checks,
      spanChecks: SPANNED,
    });

    expect(labeled.map(({ label, group }) => [label, group])).toEqual([
      ['Regex', 'Sort:9'],
      ['Sort', 'Sort:9'],
    ]);
  });

  it('joins the spans a hunk straddles into one group', () => {
    const diagnostics = [
      { check: 'Sort', line: 5, endLine: 10 },
      { check: 'SaveInLoop', line: 11, endLine: 20 },
    ];
    const hunks = [hunkAt(6), hunkChanging(9, 12), hunkAt(19)];
    const groups = labelHunks(hunks, diagnostics, { checks, spanChecks: SPANNED }).map(
      ({ group }) => group,
    );

    expect(new Set(groups).size).toBe(1);
  });

  it('gives a line added between two equal spans to the span it starts', () => {
    const diagnostics = [
      { check: 'Sort', line: 7, endLine: 10 },
      { check: 'Sort', line: 11, endLine: 14 },
    ];
    const labeled = labelHunks([insertionAfter(10)], diagnostics, {
      checks: checks,
      spanChecks: SPANNED,
    });

    expect(labeled[0]?.group).toBe('Sort:11');
  });
});
