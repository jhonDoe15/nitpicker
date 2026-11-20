import { describe, expect, it } from 'vitest';
import { withoutSupersededMessages } from './overlapping-reports.mts';

const RULE = 'nitpicker/no-accumulating-spread';
const LOOP_BAN = 'domain/ code has no loops: transform with map, filter or flatMap.';
const loopBan = {
  ruleId: 'no-restricted-syntax',
  message: LOOP_BAN,
  line: 4,
  column: 3,
  endLine: 8,
  endColumn: 4,
};

function spread(messageId: string, line: number, column: number) {
  return { ruleId: RULE, messageId, line, column, endLine: line, endColumn: column + 3 };
}

describe('withoutSupersededMessages', () => {
  it('drops a restricted-property report where the random-key rule reports the same start', () => {
    const key = { ruleId: 'nitpicker/react-no-random-key', line: 2, column: 9 };
    const property = { ruleId: 'no-restricted-properties', line: 2, column: 9 };
    const elsewhere = { ...property, column: 10 };
    expect(withoutSupersededMessages([key, property, elsewhere])).toEqual([key, elsewhere]);
  });

  it('drops a costly collection report where the in-memory query rule reports the same start', () => {
    const query = { ruleId: 'nitpicker/no-in-memory-query', line: 3, column: 43 };
    const sort = { ruleId: 'nitpicker/no-costly-collection-form', line: 3, column: 43 };
    expect(withoutSupersededMessages([query, sort])).toEqual([query]);
  });

  it('drops a wasted collection step report where the typed prefer-find reports the same start', () => {
    const typed = { ruleId: '@typescript-eslint/prefer-find', line: 2, column: 9 };
    const step = { ruleId: 'nitpicker/no-wasted-collection-step', line: 2, column: 9 };
    const other = { ruleId: 'nitpicker/no-wasted-collection-step', line: 4, column: 9 };
    expect(withoutSupersededMessages([typed, step, other])).toEqual([typed, other]);
  });

  it('drops a domain loop accumulator report inside a loop that the domain loop ban reports', () => {
    const messages = [loopBan, spread('domainLoopArray', 6, 12), spread('domainLoopObject', 7, 5)];
    expect(withoutSupersededMessages(messages)).toEqual([loopBan]);
  });

  it('keeps reduce reports, other loop messages and reports outside the loop ban', () => {
    const kept = [
      spread('domainReduceArray', 6, 20),
      spread('loopArray', 6, 12),
      spread('domainLoopArray', 3, 7),
      spread('domainLoopArray', 9, 1),
    ];
    expect(withoutSupersededMessages([loopBan, ...kept])).toEqual([loopBan, ...kept]);
  });

  it('needs the loop ban message and its end', () => {
    const other = { ...loopBan, message: 'something else' };
    const withoutEnd = { ruleId: 'no-restricted-syntax', message: LOOP_BAN, line: 4, column: 3 };
    const site = spread('domainLoopArray', 6, 12);
    expect(withoutSupersededMessages([other, site])).toHaveLength(2);
    expect(withoutSupersededMessages([withoutEnd, site])).toHaveLength(2);
  });

  it('passes through entries that are not messages', () => {
    expect(withoutSupersededMessages([null, 'text', loopBan])).toEqual([null, 'text', loopBan]);
  });
});

describe('withoutSupersededMessages for overlapping type and throw rules', () => {
  const immutable = {
    ruleId: 'functional/prefer-immutable-types',
    line: 1,
    column: 23,
    endLine: 1,
    endColumn: 35,
  };
  const readonlyArray = {
    ruleId: 'no-restricted-syntax',
    message:
      'domain/ types are readonly: write readonly T[] (or a readonly tuple) instead of a mutable array type.',
    line: 1,
    column: 30,
    endLine: 1,
    endColumn: 35,
  };

  it('drops a readonly-type report inside a parameter that prefer-immutable-types reports', () => {
    const property = {
      ...readonlyArray,
      message: 'domain/ data types are readonly: mark the property readonly.',
    };
    expect(withoutSupersededMessages([immutable, readonlyArray, property])).toEqual([immutable]);
  });

  it('keeps a readonly-type report outside every prefer-immutable-types report', () => {
    const declaration = { ...readonlyArray, line: 3, column: 16, endLine: 3, endColumn: 24 };
    expect(withoutSupersededMessages([immutable, readonlyArray, declaration])).toEqual([
      immutable,
      declaration,
    ]);
    expect(withoutSupersededMessages([readonlyArray])).toEqual([readonlyArray]);
  });

  it('keeps other restricted-syntax reports inside the parameter', () => {
    const other = { ...readonlyArray, message: 'Use `unknown` and parse it.' };
    expect(withoutSupersededMessages([immutable, other])).toEqual([immutable, other]);
  });

  const thrown = {
    ruleId: 'no-restricted-syntax',
    message:
      'Throw an Error subclass that preserves cause (new DomainError(message, { cause })), not a bare Error or a non-error value.',
    line: 8,
    column: 11,
    endLine: 8,
    endColumn: 16,
  };
  const notError = {
    ruleId: '@typescript-eslint/only-throw-error',
    messageId: 'object',
    message: 'Expected an error object to be thrown.',
    line: 8,
    column: 11,
    endLine: 8,
    endColumn: 16,
  };

  it('drops only-throw-error where the restricted throw report starts at the same place', () => {
    expect(withoutSupersededMessages([notError, thrown])).toEqual([thrown]);
  });

  it('keeps only-throw-error elsewhere and without the restricted throw report', () => {
    const elsewhere = { ...notError, line: 9 };
    expect(withoutSupersededMessages([notError, thrown, elsewhere])).toEqual([thrown, elsewhere]);
    expect(withoutSupersededMessages([notError])).toEqual([notError]);
  });
});
