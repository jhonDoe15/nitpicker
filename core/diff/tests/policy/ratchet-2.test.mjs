import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../comparison/compare.mjs';

describe('strict rules on an edited line of a legacy function', () => {
  function pushFinding(identity, line, count, rule = 'no-restricted-syntax') {
    return {
      tool: 'eslint',
      rule,
      path: 'src/f.ts',
      identity,
      message: 'Build a new array instead of push.',
      classification: 'enforceable',
      symbol: 'f',
      location: { line },
      ratchet: { key: 'count:push', value: count, existingCodeOnly: true },
    };
  }
  const strictTouched = (ranges, inserted = []) => ({
    changedLines: new Map([['src/f.ts', { added: false, ranges, inserted }]]),
    isStrictRule: () => true,
    mustMeetOnEditedLines: (rule) => rule === 'prettier/prettier',
  });
  it('fails an edited line when the function gets more of the violation', () => {
    const result = compareFindings({
      baseFindings: [pushFinding('push', 4, 1)],
      headFindings: [pushFinding('push-edited', 4, 2), pushFinding('second', 5, 2)],
      touchedCode: strictTouched([[4, 5]]),
    });

    expect(result.newFindings.map(({ identity }) => identity)).toEqual(['push-edited', 'second']);
  });
  it('fails the violation on a line the change added', () => {
    const result = compareFindings({
      baseFindings: [pushFinding('push', 4, 1)],
      headFindings: [pushFinding('push-added', 6, 1)],
      touchedCode: strictTouched([[4, 6]], [[5, 6]]),
    });

    expect(result.newFindings.map(({ identity }) => identity)).toEqual(['push-added']);
  });
  it('keeps formatting strict on every edited line', () => {
    const unformatted = pushFinding('format', 4, 1, 'prettier/prettier');

    const result = compareFindings({
      baseFindings: [unformatted],
      headFindings: [unformatted],
      touchedCode: strictTouched([[4, 4]]),
    });

    expect(result.newFindings).toEqual([unformatted]);
  });
  it('keeps a strict finding without a count ratchet new on an edited line', () => {
    const moduleLevel = { ...pushFinding('module', 4, 1), ratchet: undefined };

    const result = compareFindings({
      baseFindings: [moduleLevel],
      headFindings: [moduleLevel],
      touchedCode: strictTouched([[4, 4]]),
    });

    expect(result.newFindings).toEqual([moduleLevel]);
  });
});
