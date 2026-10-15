import {
  expectedOutput31_38,
  expectedOutput38_32,
  expectedOutput142_40,
  expectedOutput192_38,
  expectedOutput276_32,
  expectedOutput309_38,
} from '../../fixtures/expected-output/core-diff-ratchet.mjs';

import { describe, expect, it } from 'vitest';

import {
  FUNCTION_STRUCTURE_LIMITS,
  GREW_MESSAGES,
  HELD_MESSAGES,
} from '../../../../shared/policy.mjs';

import { crapFindings } from '../../../../shared/rules/crap.mjs';

import { evaluateStructure } from '../../../../shared/rules/structure.mjs';

import { compareFindings } from '../../comparison/compare.mjs';

import { parseFinding } from '../../comparison/finding-schema.mjs';

function limitFindings(functions) {
  return evaluateStructure({ functions }, 'structure')
    .filter((finding) => finding.classification === 'enforceable')
    .map((finding) => parseFinding(finding));
}

function legacy(statements, sourceHash, file = 'src/big.ts') {
  return { file, name: 'big', start: 1, end: 200, statements, sourceHash };
}

function compare(base, head, renames) {
  return compareFindings({
    baseFindings: limitFindings(base),
    headFindings: limitFindings(head),
    baseToHeadRenames: renames,
  });
}

function crapFunction({ score, hash, name = 'priceOf', path = 'src/price.ts' }) {
  return {
    path,
    name,
    identity: `function:${name}:occurrence:1:source:${hash}`,
    ratchetKey: `function:${name}:occurrence:1:crap`,
    crap: score,
  };
}

function crapComparison(base, head, renames) {
  const parse = (functions) =>
    crapFindings(functions, { tool: 'crap', limit: 9 }).map((finding) => parseFinding(finding));
  return compareFindings({
    baseFindings: parse(base),
    headFindings: parse(head),
    baseToHeadRenames: renames,
  });
}

describe('size limits on edited legacy functions', () => {
  it('keeps an edited function baselined when its metric does not grow', () => {
    const result = compare([legacy(80, 'before')], [legacy(78, 'after')]);
    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toEqual(expectedOutput31_38());
  });
  it('fails an edited function whose metric grows past the base value', () => {
    const result = compare([legacy(80, 'before')], [legacy(81, 'after')]);
    expect(result.newFindings).toEqual(expectedOutput38_32());
    expect(result.resolvedFindings).toHaveLength(1);
  });
  it('fails a function the change pushes over the limit', () => {
    const result = compare([legacy(10, 'before')], [legacy(80, 'after')]);
    expect(result.newFindings).toHaveLength(1);
  });
  it('fails a new function over the limit', () => {
    const result = compare([], [legacy(80, 'after')]);
    expect(result.newFindings).toHaveLength(1);
  });
  it('follows renamed files', () => {
    const result = compare(
      [legacy(80, 'before', 'src/old.ts')],
      [legacy(80, 'after', 'src/new.ts')],
      new Map([['src/old.ts', 'src/new.ts']]),
    );
    expect(result.newFindings).toEqual([]);
  });
});
describe('the message of a function that got worse', () => {
  const METRIC_START = { lines: 68, statements: 16, maxControlNesting: 3, parameters: 4 };
  function computeInvoice(metric, value, sourceHash) {
    return {
      file: 'src/invoice.ts',
      name: 'computeInvoice',
      start: 1,
      end: 90,
      [metric]: value,
      sourceHash,
    };
  }
  function messages(result) {
    return result.newFindings.map(({ message }) => message);
  }
  it.each([
    [
      'lines',
      'computeInvoice grew from 68 to 69 lines (limit 50). Put new code in a new function.',
    ],
    [
      'statements',
      'computeInvoice grew from 16 to 17 statements (limit 15). Put new code in a new function.',
    ],
    [
      'maxControlNesting',
      'computeInvoice control nesting grew from 3 to 4 levels (limit 2). Put the new nested code in a new function.',
    ],
    [
      'parameters',
      'computeInvoice grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
    ],
  ])('shows the base value and the fix for %s', (metric, expected) => {
    const start = METRIC_START[metric];

    const result = compare(
      [computeInvoice(metric, start, 'before')],
      [computeInvoice(metric, start + 1, 'after')],
    );

    expect(messages(result)).toEqual([expected]);
  });
  it.each([
    [
      'lines',
      'computeInvoice: 68 lines (limit 50), allowed because base was {base}; any increase fails.',
    ],
    [
      'statements',
      'computeInvoice: 16 statements (limit 15), allowed because base was {base}; any increase fails.',
    ],
    [
      'maxControlNesting',
      'computeInvoice: control nesting 3 (limit 2), allowed because base was {base}; any increase fails.',
    ],
    [
      'parameters',
      'computeInvoice: 4 parameters (limit 3), allowed because base was {base}; any increase fails.',
    ],
  ])('carries the held note for %s on the held finding', (metric, expected) => {
    const start = METRIC_START[metric];

    const result = compare(
      [computeInvoice(metric, start, 'before')],
      [computeInvoice(metric, start, 'after')],
    );

    expect(result.unchangedFindings.map(({ ratchet }) => ratchet.heldMessage)).toEqual([expected]);
  });
  it('has a held note for every limited metric', () => {
    expect(Object.keys(HELD_MESSAGES).sort()).toEqual(Object.keys(GREW_MESSAGES).sort());
  });
  it('has a message for every limited metric', () => {
    expect(Object.keys(METRIC_START).sort()).toEqual(Object.keys(FUNCTION_STRUCTURE_LIMITS).sort());
    expect([...new Set(Object.keys(GREW_MESSAGES))].sort()).toEqual(expectedOutput142_40());
  });
  it('keeps the plain message for a function the change pushes over the limit', () => {
    const result = compare(
      [computeInvoice('lines', 40, 'before')],
      [computeInvoice('lines', 72, 'after')],
    );

    expect(messages(result)).toEqual(['computeInvoice has 72 lines; limit is 50']);
  });
  it('keeps the plain message for a new function', () => {
    const result = compare([], [computeInvoice('lines', 72, 'after')]);

    expect(messages(result)).toEqual(['computeInvoice has 72 lines; limit is 50']);
  });
});
describe('CRAP limit on edited legacy functions', () => {
  it('keeps an edited function baselined when its score is unchanged', () => {
    const result = crapComparison(
      [crapFunction({ score: 15, hash: 'before' })],
      [crapFunction({ score: 15, hash: 'after' })],
    );

    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toEqual(expectedOutput192_38());
  });
  it('carries a held note that shows the score, the limit and the base', () => {
    const result = crapComparison(
      [crapFunction({ score: 16.02, hash: 'before' })],
      [crapFunction({ score: 10, hash: 'after' })],
    );

    expect(result.unchangedFindings.map(({ ratchet }) => ratchet.heldMessage)).toEqual([
      'priceOf: CRAP 10.00 (limit 9), allowed because base was {base}; any increase fails.',
    ]);
  });
  it('keeps an edited function baselined when its score fell but is still over the limit', () => {
    const result = crapComparison(
      [crapFunction({ score: 15, hash: 'before' })],
      [crapFunction({ score: 12.5, hash: 'after' })],
    );

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });
  it('ignores noise below the two decimals the message shows', () => {
    const result = crapComparison(
      [crapFunction({ score: 15.001, hash: 'before' })],
      [crapFunction({ score: 15.004, hash: 'after' })],
    );

    expect(result.newFindings).toEqual([]);
  });
  it('fails an edited function whose score rose and says from what', () => {
    const result = crapComparison(
      [crapFunction({ score: 15, hash: 'before' })],
      [crapFunction({ score: 17.5, hash: 'after' })],
    );

    expect(result.newFindings.map(({ message }) => message)).toEqual([
      'priceOf CRAP rose from 15 to 17.5 (limit 9). Put new code in a new function and cover it with tests.',
    ]);
  });
  it('fails a function the change pushes over the limit, with the plain message', () => {
    const result = crapComparison(
      [crapFunction({ score: 4, hash: 'before' })],
      [crapFunction({ score: 15, hash: 'after' })],
    );

    expect(result.newFindings.map(({ message }) => message)).toEqual([
      'priceOf has CRAP 15.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
    ]);
  });
  it('fails a new function over the limit', () => {
    const result = crapComparison([], [crapFunction({ score: 15, hash: 'after' })]);

    expect(result.newFindings).toHaveLength(1);
  });
  it('follows renamed files', () => {
    const result = crapComparison(
      [crapFunction({ score: 15, hash: 'before', path: 'src/old.ts' })],
      [crapFunction({ score: 15, hash: 'after', path: 'src/new.ts' })],
      new Map([['src/old.ts', 'src/new.ts']]),
    );

    expect(result.newFindings).toEqual([]);
  });
  it('fails every edit when the adapter gives no ratchet key', () => {
    const withoutKey = (hash) => ({ ...crapFunction({ score: 15, hash }), ratchetKey: undefined });

    const result = crapComparison([withoutKey('before')], [withoutKey('after')]);

    expect(result.newFindings).toHaveLength(1);
  });
  it('never ratchets a function with unknown coverage', () => {
    const unknown = (hash) => crapFunction({ score: Number.NaN, hash });

    const result = crapComparison([unknown('before')], [unknown('after')]);

    expect(result.newFindings).toEqual(expectedOutput276_32());
  });
});
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
    expect(result.unchangedFindings).toEqual(expectedOutput309_38());
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
  it('keeps an edited line baselined when the function has no more of the violation', () => {
    const result = compareFindings({
      baseFindings: [pushFinding('push', 4, 2), pushFinding('other', 9, 2)],
      headFindings: [pushFinding('push', 4, 2), pushFinding('other-edited', 9, 2)],
      touchedCode: strictTouched([
        [4, 4],
        [9, 9],
      ]),
    });

    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings.map(({ identity }) => identity)).toEqual([
      'other-edited',
      'push',
    ]);
  });
});
