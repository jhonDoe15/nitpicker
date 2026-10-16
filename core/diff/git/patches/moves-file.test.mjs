import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readMovesFile } from '../../../../shared/rules/facts/baseline.mjs';
import { withMovesFile } from './moves-file.mjs';

describe('moves file', () => {
  it('hands the moves to the operation as a file, which is gone afterwards', () => {
    const moves = new Map([
      ['src/old.ts', 'src/new.ts'],
      ['src/a/x.ts', 'src/b/x.ts'],
    ]);
    const handed = withMovesFile(moves, (movesFile) => ({
      movesFile,
      moves: readMovesFile(movesFile),
    }));

    expect(handed.moves).toEqual(moves);
    expect(existsSync(handed.movesFile)).toBe(false);
  });

  it('writes no file when nothing moved, and reads no file as no moves', () => {
    expect(withMovesFile(new Map(), (movesFile) => movesFile)).toBeUndefined();
    expect(readMovesFile(undefined)).toEqual(new Map());
  });

  it('removes the file when the operation throws', () => {
    const seen = [];

    expect(() =>
      withMovesFile(new Map([['a.ts', 'b.ts']]), (movesFile) => {
        seen.push(movesFile);
        throw new Error('stop');
      }),
    ).toThrow('stop');
    expect(existsSync(seen[0])).toBe(false);
  });
});
