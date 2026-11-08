import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { changeRepositories, lines } from './test-support/changes-between.mjs';
import { lineMapOf } from './unchanged-lines.mjs';

const repositories = changeRepositories();

afterAll(() => {
  repositories.remove();
});

describe('lines that moved within a file', () => {
  let changes;

  beforeAll(() => {
    const sum = [
      '  let total = 0;',
      '  for (const item of items) total += item;',
      '  return total;',
    ];
    changes = repositories.changesBetween({
      'load.ts': [
        lines('function load(items) {', "  console.log('start');", ...sum, '}'),
        lines(
          ...['function sum(items) {', ...sum, '}', ''],
          ...['function load(items) {', '  console.log("start");', '  return sum(items);', '}'],
        ),
      ],
    });
  });

  it('keeps the first lines of a function unchanged when a block of it moves to a helper above it', () => {
    const { ranges } = changes.get('load.ts');
    const isChanged = (line) => ranges.some(([start, end]) => start <= line && line <= end);

    expect([1, 7, 8, 9].map(isChanged)).toEqual([true, false, false, true]);
  });

  it('maps a head line to its base line, around hunks and through carried lines', () => {
    const file = {
      hunks: [
        [1, 2, 1, 1],
        [5, 0, 5, 6],
      ],
      carried: [
        [8, 1],
        [9, 2],
      ],
    };

    const lineMap = lineMapOf(file);

    expect([2, 3, 4, 9, 10, 11].map((line) => lineMap.baseLineOf(line))).toEqual([
      3,
      4,
      5,
      2,
      undefined,
      6,
    ]);
    expect([1, 3, 6].map((line) => lineMap.headLineOf(line))).toEqual([8, 2, 11]);
  });

  it('maps lines one to one in a file the change left alone', () => {
    expect(lineMapOf(undefined).baseLineOf(7)).toBe(7);
    expect(lineMapOf(undefined).headLineOf(7)).toBe(7);
  });
});
