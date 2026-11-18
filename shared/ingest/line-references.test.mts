import { describe, expect, it } from 'vitest';
import { withoutLineReferences } from './line-references.mjs';

describe('withoutLineReferences', () => {
  it.each([
    [
      "found ungrouped overloads of 'max' on line(s): 1193, 1211, 1232",
      "found ungrouped overloads of 'max' on line",
    ],
    [
      "The value assigned to 'count' is never used (overwritten on lines 1052, 1060 and 1068)",
      "The value assigned to 'count' is never used (overwritten on line)",
    ],
    [
      "The String literal 'id' appears 4 times in this file; the first occurrence is on line 1,114",
      "The String literal 'id' appears 4 times in this file; the first occurrence is on line",
    ],
    ['first seen on line 7.', 'first seen on line.'],
    ['lines 3, 4, and 5 differ', 'line differ'],
    ['seen on line 5, 3 more times', 'seen on line, 3 more times'],
    ['on lines 5, 9, 12 other places', 'on line, 12 other places'],
  ])('drops the line numbers from %j', (text, expected) => {
    expect(withoutLineReferences(text)).toBe(expected);
  });

  it('gives the same text when the referenced lines move', () => {
    expect(withoutLineReferences('overwritten on lines 1052, 1060 and 1068')).toBe(
      withoutLineReferences('overwritten on lines 1043, 1051 and 1059'),
    );
  });

  it('keeps numbers that are not line references', () => {
    expect(withoutLineReferences("appears 4 times; 'pipeline' 12 deadline 3")).toBe(
      "appears 4 times; 'pipeline' 12 deadline 3",
    );
  });
});
