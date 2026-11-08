import { describe, expect, it } from 'vitest';
import { withoutSupersededMessages } from './overlapping-reports.mjs';

const RULE = 'nitpicker/no-accumulating-spread';
const noLet = { ruleId: 'functional/no-let', line: 4, column: 3, endLine: 4, endColumn: 40 };

function spread(messageId, line, column) {
  return { ruleId: RULE, messageId, line, column, endLine: line, endColumn: column + 3 };
}

describe('withoutSupersededMessages', () => {
  it('drops a restricted-property report where the random-key rule reports the same start', () => {
    const key = { ruleId: 'nitpicker/react-no-random-key', line: 2, column: 9 };
    const property = { ruleId: 'no-restricted-properties', line: 2, column: 9 };
    const elsewhere = { ...property, column: 10 };
    expect(withoutSupersededMessages([key, property, elsewhere])).toEqual([key, elsewhere]);
  });

  it('drops a loop accumulator report inside a let declaration that no-let already reports', () => {
    const messages = [noLet, spread('loopArray', 4, 7), spread('domainLoopObject', 4, 40)];
    expect(withoutSupersededMessages(messages)).toEqual([noLet]);
  });

  it('keeps reduce reports, reports outside the declaration and lines without a no-let report', () => {
    const kept = [
      spread('reduceArray', 4, 20),
      spread('loopArray', 4, 2),
      spread('loopArray', 4, 41),
      spread('loopArray', 3, 7),
      spread('loopArray', 5, 1),
    ];
    expect(withoutSupersededMessages([noLet, ...kept])).toEqual([noLet, ...kept]);
  });

  it('reads a declaration over several lines and needs the end of the no-let report', () => {
    const multiLine = { ...noLet, endLine: 6, endColumn: 2 };
    const inside = [spread('loopArray', 5, 80), spread('loopArray', 6, 2)];
    expect(withoutSupersededMessages([multiLine, ...inside])).toEqual([multiLine]);
    const withoutEnd = { ruleId: 'functional/no-let', line: 4, column: 3 };
    expect(withoutSupersededMessages([withoutEnd, spread('loopArray', 4, 7)])).toHaveLength(2);
  });

  it('passes through entries that are not messages', () => {
    expect(withoutSupersededMessages([null, 'text', noLet])).toEqual([null, 'text', noLet]);
  });
});
