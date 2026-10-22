import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../comparison/compare.mjs';

describe('count ratchet on findings inside an edited function', () => {
  function anyFinding(identity, line, count) {
    return {
      tool: 'eslint',
      rule: '@typescript-eslint/no-explicit-any',
      path: 'src/f.ts',
      identity,
      message: 'Unexpected any.',
      classification: 'enforceable',
      symbol: 'f',
      location: { line },
      ratchet: { key: 'count:any', value: count, existingCodeOnly: true },
    };
  }
  const touched = (inserted, ranges = inserted) => ({
    changedLines: new Map([['src/f.ts', { added: false, ranges, inserted }]]),
    isStrictRule: () => false,
  });
  it('holds every edited finding while the function has no more of them', () => {
    const result = compareFindings({
      baseFindings: [anyFinding('a', 3, 2), anyFinding('b', 5, 2)],
      headFindings: [anyFinding('a2', 3, 2), anyFinding('b2', 5, 2)],
      touchedCode: touched([], [[3, 5]]),
    });

    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toEqual([
      {
        tool: 'eslint',
        rule: '@typescript-eslint/no-explicit-any',
        path: 'src/f.ts',
        identity: 'a2',
        message: 'Unexpected any.',
        classification: 'enforceable',
        symbol: 'f',
        location: { line: 3 },
        ratchet: { key: 'count:any', value: 2, existingCodeOnly: true },
        heldAtBase: 2,
      },
      {
        tool: 'eslint',
        rule: '@typescript-eslint/no-explicit-any',
        path: 'src/f.ts',
        identity: 'b2',
        message: 'Unexpected any.',
        classification: 'enforceable',
        symbol: 'f',
        location: { line: 5 },
        ratchet: { key: 'count:any', value: 2, existingCodeOnly: true },
        heldAtBase: 2,
      },
    ]);
  });
  it('reports the base findings left over when the function has fewer of them', () => {
    const result = compareFindings({
      baseFindings: [anyFinding('a', 3, 2), anyFinding('b', 5, 2)],
      headFindings: [anyFinding('a2', 3, 1)],
      touchedCode: touched([], [[3, 3]]),
    });

    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toHaveLength(1);
  });
  it('fails every edited finding when the function has more of them', () => {
    const result = compareFindings({
      baseFindings: [anyFinding('a', 3, 2), anyFinding('b', 5, 2)],
      headFindings: [anyFinding('a2', 3, 3), anyFinding('b2', 5, 3), anyFinding('c', 7, 3)],
      touchedCode: touched([[7, 7]], [[3, 7]]),
    });

    expect(result.newFindings).toHaveLength(3);
  });
  it('fails a violation swapped in on a line the change added', () => {
    const result = compareFindings({
      baseFindings: [anyFinding('fixed', 3, 1)],
      headFindings: [anyFinding('swapped-in', 8, 1)],
      touchedCode: touched([[8, 8]]),
    });

    expect(result.newFindings.map(({ identity }) => identity)).toEqual(['swapped-in']);
  });
  it('does not match a finding on an added line to a base finding by identity', () => {
    const callback = (occurrence, line) => anyFinding(`callback|occurrence:${occurrence}`, line, 2);

    const result = compareFindings({
      baseFindings: [callback(1, 3), callback(2, 9)],
      headFindings: [callback(1, 3), callback(2, 12)],
      touchedCode: touched([[12, 12]]),
    });

    expect(result.newFindings.map(({ identity }) => identity)).toEqual(['callback|occurrence:2']);
    expect(result.unchangedFindings.map(({ identity }) => identity)).toEqual([
      'callback|occurrence:1',
    ]);
  });
  it('still holds a violation that moved to an edited line the change did not add', () => {
    const result = compareFindings({
      baseFindings: [anyFinding('before', 3, 1)],
      headFindings: [anyFinding('after', 3, 1)],
      touchedCode: touched([], [[3, 3]]),
    });

    expect(result.newFindings).toEqual([]);
  });
});

describe('growth advice on a finding that is new in a function with findings at base', () => {
  const ADVICE = 'The base had {base}; keep to it.';
  function throwFinding(identity, line, count, ratchet = {}) {
    return {
      tool: 'eslint',
      rule: 'nitpicker/no-throw',
      path: 'src/f.ts',
      identity,
      message: 'Do not throw.',
      classification: 'enforceable',
      symbol: 'f',
      location: { line },
      ratchet: {
        key: 'count:noThrow',
        value: count,
        existingCodeOnly: true,
        growthAdvice: ADVICE,
        ...ratchet,
      },
    };
  }
  const inserted = (lines) => ({
    changedLines: new Map([['src/f.ts', { added: false, ranges: lines, inserted: lines }]]),
    isStrictRule: () => true,
    mustMeetOnEditedLines: () => false,
  });
  it('appends the advice with the base count to a throw added on a new line', () => {
    const result = compareFindings({
      baseFindings: [throwFinding('first', 4, 2), throwFinding('second', 9, 2)],
      headFindings: [
        throwFinding('first', 4, 3),
        throwFinding('second', 9, 3),
        throwFinding('added', 12, 3),
      ],
      touchedCode: inserted([[12, 12]]),
    });

    expect(result.newFindings.map(({ message }) => message)).toEqual([
      'Do not throw. The base had 2; keep to it.',
    ]);
  });
  it('puts the advice before the exception sentence, which stays last', () => {
    const route =
      'If this is intended, add {"rule":"nitpicker/no-throw","paths":["src/f.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.';
    const routed = (identity, line, count) => ({
      ...throwFinding(identity, line, count),
      message: `Do not throw. ${route}`,
    });
    const result = compareFindings({
      baseFindings: [routed('first', 4, 2), routed('second', 9, 2)],
      headFindings: [routed('first', 4, 3), routed('second', 9, 3), routed('added', 12, 3)],
      touchedCode: inserted([[12, 12]]),
    });

    expect(result.newFindings.map(({ message }) => message)).toEqual([
      `Do not throw. The base had 2; keep to it. ${route}`,
    ]);
  });
  it('appends the advice to an edited throw the function now has more of', () => {
    const result = compareFindings({
      baseFindings: [throwFinding('first', 4, 1)],
      headFindings: [throwFinding('first-edited', 4, 2), throwFinding('second', 6, 2)],
      touchedCode: {
        ...inserted([]),
        changedLines: new Map([['src/f.ts', { added: false, ranges: [[4, 6]], inserted: [] }]]),
      },
    });

    expect(result.newFindings.map(({ message }) => message)).toEqual([
      'Do not throw. The base had 1; keep to it.',
      'Do not throw. The base had 1; keep to it.',
    ]);
  });
  it('leaves the message alone when the base function had none of them', () => {
    const result = compareFindings({
      baseFindings: [],
      headFindings: [throwFinding('added', 12, 1)],
      touchedCode: inserted([[12, 12]]),
    });

    expect(result.newFindings.map(({ message }) => message)).toEqual(['Do not throw.']);
  });
  it('leaves the message alone when the finding carries no advice', () => {
    const result = compareFindings({
      baseFindings: [throwFinding('first', 4, 1, { growthAdvice: undefined })],
      headFindings: [throwFinding('added', 12, 1, { growthAdvice: undefined })],
      touchedCode: inserted([[12, 12]]),
    });

    expect(result.newFindings.map(({ message }) => message)).toEqual(['Do not throw.']);
  });
});
