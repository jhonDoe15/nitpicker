import { describe, expect, it } from 'vitest';
import {
  FUNCTION_STRUCTURE_LIMITS,
  GREW_MESSAGES,
  HELD_MESSAGES,
} from '../../../../../shared/policy.mjs';
import { evaluateStructure } from '../../../../../shared/rules/structure.mjs';
import { compareFindings } from '../../../comparison/compare.mjs';
import { parseFinding } from '../../../comparison/finding-schema.mjs';

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

describe('size limits on edited legacy functions', () => {
  it('keeps an edited function baselined when its metric does not grow', () => {
    const result = compare([legacy(80, 'before')], [legacy(78, 'after')]);
    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toEqual([
      {
        tool: 'structure',
        rule: 'function-statements-limit',
        path: 'src/big.ts',
        identity: 'function:big:occurrence:1:source:after',
        message:
          'big has 78 statements; limit is 15. Split by responsibility and name each part for what it checks or does.',
        classification: 'enforceable',
        symbol: 'big',
        location: { line: 1 },
        ratchet: {
          key: 'function:big:occurrence:1:statements',
          value: 78,
          worseMessage:
            'big grew from {base} to 78 statements (limit 15). Put new code in a new function.',
          heldMessage:
            'big: 78 statements (limit 15), allowed because base was {base}; any increase fails.',
        },
        heldAtBase: 80,
      },
    ]);
  });
  it('fails an edited function whose metric grows past the base value', () => {
    const result = compare([legacy(80, 'before')], [legacy(81, 'after')]);
    expect(result.newFindings).toEqual([
      {
        tool: 'structure',
        rule: 'function-statements-limit',
        path: 'src/big.ts',
        identity: 'function:big:occurrence:1:source:after',
        message: 'big grew from 80 to 81 statements (limit 15). Put new code in a new function.',
        classification: 'enforceable',
        symbol: 'big',
        location: { line: 1 },
        ratchet: {
          key: 'function:big:occurrence:1:statements',
          value: 81,
          worseMessage:
            'big grew from {base} to 81 statements (limit 15). Put new code in a new function.',
          heldMessage:
            'big: 81 statements (limit 15), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
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
    expect([...new Set(Object.keys(GREW_MESSAGES))].sort()).toEqual([
      'crap',
      'fileLines',
      'folderFiles',
      'lineLength',
      'lines',
      'maxControlNesting',
      'parameters',
      'statements',
    ]);
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
