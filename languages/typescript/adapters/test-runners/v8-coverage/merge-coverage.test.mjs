import { describe, expect, it } from 'vitest';
import { mergedCoverage } from './merge-coverage.mjs';

const at = (line, column) => ({
  start: { line, column },
  end: { line, column: column + 1 },
});

const fn = (name, line, column) => ({ name, decl: at(line, column), loc: at(line, column), line });

const branch = (line, column) => ({
  type: 'cond-expr',
  loc: at(line, column),
  locations: [at(line, column), at(line, column + 1)],
  line,
});

const native = {
  path: '/p/src/pick.ts',
  statementMap: { 0: at(1, 0), 1: at(1, 13) },
  s: { 0: 1, 1: 1 },
  fnMap: { 0: fn('pick', 1, 13) },
  f: { 0: 1 },
  branchMap: { 0: branch(2, 9) },
  b: { 0: [1, 0] },
};

const rewritten = {
  path: '/p/src/pick.ts',
  statementMap: { 0: at(1, 14), 1: at(1, 0) },
  s: { 0: 2, 1: 2 },
  fnMap: { 0: fn('later', 3, 2), 1: fn('pick', 1, 14) },
  f: { 0: 2, 1: 2 },
  branchMap: { 0: branch(2, 10) },
  b: { 0: [0, 2] },
};

describe('the coverage of a file that several test processes loaded', () => {
  it('adds up the counts of the entries at the same place and keeps the entries of either', () => {
    expect(mergedCoverage(native, rewritten)).toEqual({
      path: '/p/src/pick.ts',
      statementMap: { 0: at(1, 0), 1: at(1, 13) },
      s: { 0: 3, 1: 3 },
      fnMap: { 0: fn('pick', 1, 13), 1: fn('later', 3, 2) },
      f: { 0: 3, 1: 2 },
      branchMap: { 0: branch(2, 9) },
      b: { 0: [1, 2] },
    });
  });

  it('is the coverage of the only process that loaded it', () => {
    expect(mergedCoverage(undefined, native)).toEqual(native);
  });
});
