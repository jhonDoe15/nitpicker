import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../comparison/compare.mjs';

function clone(identity, value, [[aStart, aEnd], [bStart, bEnd]]) {
  return {
    tool: 'duplicates',
    rule: 'duplicate-clone',
    path: 'a.py',
    identity,
    message: `This code repeats b.py:${String(bStart)}. Keep one copy and call it from both places.`,
    classification: 'enforceable',
    location: { line: aStart },
    ratchet: {
      key: 'pair:a.py|b.py:clone',
      value,
      divisible: true,
      mustKeepUnchangedLines: [
        { path: 'a.py', startLine: aStart, endLine: aEnd },
        { path: 'b.py', startLine: bStart, endLine: bEnd },
      ],
    },
  };
}

function hunk(oldStart, oldCount, newStart, newCount) {
  return { oldStart, oldCount, newStart, newCount };
}

function changedFile(hunks) {
  const ranges = hunks
    .filter(({ newCount }) => newCount > 0)
    .map(({ newStart, newCount }) => [newStart, newStart + newCount - 1]);
  return { added: false, ranges, inserted: [], hunks };
}

function compared(baseFindings, headFindings, files) {
  const result = compareFindings({
    baseFindings,
    headFindings,
    touchedCode: {
      changedLines: new Map(
        Object.entries(files).map(([file, hunks]) => [file, changedFile(hunks)]),
      ),
      isStrictRule: () => false,
    },
  });
  return {
    newIdentities: result.newFindings.map((finding) => finding.identity),
    held: result.unchangedFindings.map((finding) => [finding.identity, finding.heldAtBase]),
  };
}

describe('duplicate clones held only on the unchanged lines of a base clone', () => {
  const legacy = clone('legacy', 120, [
    [1, 15],
    [1, 15],
  ]);

  it('fails a pasted clone whose few context lines git kept map into a deleted legacy copy', () => {
    const pasted = clone('pasted', 120, [
      [18, 32],
      [5, 19],
    ]);

    expect(
      compared([legacy], [pasted], { 'b.py': [hunk(1, 1, 1, 5), hunk(3, 12, 7, 12)] }),
    ).toEqual({ newIdentities: ['pasted'], held: [] });
  });

  it('fails a clone formed by deleting the code between two blocks', () => {
    const elsewhere = clone('elsewhere', 120, [
      [40, 54],
      [40, 54],
    ]);
    const joined = clone('joined', 100, [
      [3, 12],
      [3, 12],
    ]);

    expect(
      compared([elsewhere], [joined], { 'a.py': [hunk(40, 15, 39, 0)], 'b.py': [hunk(6, 5, 5, 0)] })
        .newIdentities,
    ).toEqual(['joined']);
  });

  it('holds a legacy clone that moved down and shrank where most of it maps back', () => {
    const moved = clone('moved', 100, [
      [4, 18],
      [1, 15],
    ]);

    expect(
      compared([legacy], [moved], { 'a.py': [hunk(0, 0, 1, 3)], 'b.py': [hunk(7, 3, 7, 3)] }),
    ).toEqual({ newIdentities: [], held: [['moved', 120]] });
  });

  it('holds each half of a split legacy clone at the base clone it came from', () => {
    const base = [
      clone('first', 100, [
        [1, 20],
        [1, 20],
      ]),
      clone('second', 55, [
        [40, 50],
        [40, 50],
      ]),
    ];
    const head = [
      clone('first-top', 50, [
        [1, 9],
        [1, 9],
      ]),
      clone('first-bottom', 50, [
        [11, 20],
        [11, 20],
      ]),
      clone('second-renamed', 55, [
        [40, 50],
        [40, 50],
      ]),
    ];

    expect(
      compared(base, head, {
        'a.py': [hunk(45, 1, 45, 1)],
        'b.py': [hunk(10, 1, 10, 1), hunk(45, 1, 45, 1)],
      }),
    ).toEqual({
      newIdentities: [],
      held: [
        ['first-bottom', 100],
        ['first-top', 100],
        ['second-renamed', 55],
      ],
    });
  });

  it('assigns the larger clones first when no line map is available', () => {
    const base = [
      clone('first', 100, [
        [1, 20],
        [1, 20],
      ]),
      clone('second', 55, [
        [40, 50],
        [40, 50],
      ]),
    ];
    const head = [
      clone('first-top', 50, [
        [1, 9],
        [1, 9],
      ]),
      clone('first-bottom', 50, [
        [11, 20],
        [11, 20],
      ]),
      clone('second-renamed', 55, [
        [40, 50],
        [40, 50],
      ]),
    ];
    const result = compareFindings({
      baseFindings: base,
      headFindings: head,
      touchedCode: {
        changedLines: new Map([
          ['a.py', { added: false, ranges: [[45, 45]], inserted: [] }],
          [
            'b.py',
            {
              added: false,
              ranges: [
                [10, 10],
                [45, 45],
              ],
              inserted: [],
            },
          ],
        ]),
        isStrictRule: () => false,
      },
    });

    expect(result.newFindings).toEqual([]);
  });
});
