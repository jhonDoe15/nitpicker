import { describe, expect, it } from 'vitest';
import { readTreeUnits, sourceBatches } from './tree-batches.mts';

const SIZES: Readonly<Record<string, number>> = {
  'A.java': 6,
  'B.java': 3,
  'C.java': 20,
  'D.java': 1,
};

function sizeOf(file: string): number {
  return SIZES[file] ?? 0;
}

describe('syntax trees read in batches of source files', () => {
  it('closes a batch before the file that would take it past the limit, and keeps a large file alone', () => {
    expect([
      sourceBatches(['A.java', 'B.java', 'C.java', 'D.java'], sizeOf, 10),
      sourceBatches(['A.java', 'B.java', 'D.java'], sizeOf, 10),
      sourceBatches([], sizeOf, 10),
    ]).toEqual([
      [['A.java', 'B.java'], ['C.java'], ['D.java']],
      [['A.java', 'B.java', 'D.java']],
      [],
    ]);
  });

  it('joins the units of every batch in file order and refuses a result that is no list', () => {
    const requests: unknown[] = [];
    const units = readTreeUnits(
      { script: 'trees.mjs', root: '/missing', files: ['A.java', 'B.java'], subject: 'Java' },
      ({ request }) => {
        requests.push(request);
        return [{ file: 'A.java' }, { file: 'B.java' }];
      },
    );

    expect([units, requests]).toEqual([
      [{ file: 'A.java' }, { file: 'B.java' }],
      [{ root: '/missing', files: ['A.java', 'B.java'] }],
    ]);
    expect(() =>
      readTreeUnits(
        { script: 'trees.mjs', root: '/missing', files: ['A.java'], subject: 'Java' },
        () => ({}),
      ),
    ).toThrow('Reading Java syntax trees returned no list');
  });
});
