import { describe, expect, it } from 'vitest';
import {
  exceptionEntryText,
  exceptionSentence,
} from '../../../shared/messages/exception-sentence.mjs';
import { fieldAt } from '../../../scripts/json/fields.mts';
import { fieldOf } from '../../../shared/values/readers.mts';
import { schemaAccepts } from './test-support/findings-schema-check.mts';
import { parseAnalyzerReport, parseFinding } from './test-support/parsed-findings.mts';

const ENTRY = { rule: 'file-lines-limit', paths: ['src/a.ts'], reason: '...' };
const BASE = {
  tool: 'structure',
  rule: 'file-lines-limit',
  path: 'src/a.ts',
  identity: 'file-lines',
  classification: 'enforceable',
};
function entryText(): string {
  return exceptionEntryText({
    rule: ENTRY.rule,
    path: 'src/a.ts',
    glob: undefined,
    function: undefined,
    name: undefined,
    packages: undefined,
  });
}

function withSentence(list: string): string {
  return `File has 400 lines. Split it. ${exceptionSentence(entryText(), list)}`;
}

function accepted(finding: unknown): boolean {
  return schemaAccepts([finding]);
}

describe('exception of a parsed finding', () => {
  it('is read from the sentence the message ends with, with the list that takes it', () => {
    const parsed = parseFinding({ ...BASE, message: withSentence('exceptions') });

    expect(fieldOf(parsed, 'exception')).toEqual(ENTRY);
    expect(fieldOf(parsed, 'exceptionList')).toBe('exceptions');
    expect(accepted(parsed)).toBe(true);
  });

  it('names the Python list for a Python rule', () => {
    const parsed = parseFinding({ ...BASE, message: withSentence('python.exceptions') });

    expect(fieldOf(parsed, 'exceptionList')).toBe('python.exceptions');
  });

  it('is absent for a message without the sentence', () => {
    const parsed = parseFinding({ ...BASE, message: 'File has 400 lines.' });

    expect(parsed).not.toHaveProperty('exception');
    expect(parsed).not.toHaveProperty('exceptionList');
  });

  it('keeps an entry an analyzer gives when it is the one the message prints', () => {
    const exception = { reason: '...', paths: ['src/a.ts'], rule: 'file-lines-limit' };
    const parsed = parseFinding({
      ...BASE,
      message: withSentence('exceptions'),
      exception,
      exceptionList: 'exceptions',
    });

    expect([fieldOf(parsed, 'exception'), fieldOf(parsed, 'exceptionList')]).toEqual([
      exception,
      'exceptions',
    ]);
  });

  it.each([
    [
      'an entry that differs from the one the message prints',
      withSentence('exceptions'),
      { exception: { rule: 'x', paths: ['y'], reason: 'because' }, exceptionList: 'exceptions' },
      'finding (structure file-lines-limit in src/a.ts): exception {"rule":"x","paths":["y"],"reason":"because"} in "exceptions" differs from the entry the message prints',
    ],
    [
      'the list of the other language',
      withSentence('exceptions'),
      { exception: ENTRY, exceptionList: 'python.exceptions' },
      'finding (structure file-lines-limit in src/a.ts): exception {"rule":"file-lines-limit","paths":["src/a.ts"],"reason":"..."} in "python.exceptions" differs from the entry the message prints',
    ],
    [
      'an entry on a message that prints none',
      'File has 400 lines.',
      { exception: ENTRY, exceptionList: 'exceptions' },
      'finding (structure file-lines-limit in src/a.ts): exception is set, but the message prints no exception sentence',
    ],
    [
      'an allowed form the message does not state',
      'File has 400 lines. Split it.',
      { allowedForm: 'Merge it.' },
      'finding (structure file-lines-limit in src/a.ts): allowedForm is not part of the message: Merge it.',
    ],
  ])('refuses %s, naming the finding', (_name, message, fields, error) => {
    expect(() => parseFinding({ ...BASE, message, ...fields })).toThrow(new TypeError(error));
  });

  it('names the analyzer and the finding when an exception comes without its list', () => {
    expect(() =>
      parseAnalyzerReport(
        { findings: [{ ...BASE, message: withSentence('exceptions'), exception: ENTRY }] },
        'custom-linter',
      ),
    ).toThrow(
      new TypeError(
        'custom-linter findings[0] (structure file-lines-limit in src/a.ts): exception needs exceptionList: "exceptions" or "python.exceptions"',
      ),
    );
  });

  it.each([
    [
      'an entry without paths',
      { exception: { rule: 'x', reason: 'r' }, exceptionList: 'exceptions' },
    ],
    ['an unknown list', { exception: ENTRY, exceptionList: 'elsewhere' }],
    ['an entry without its list', { exception: ENTRY }],
    ['a list without its entry', { exceptionList: 'exceptions' }],
  ])('refuses %s', (_name, fields) => {
    expect(() => parseFinding({ ...BASE, message: 'File is long.', ...fields })).toThrow(TypeError);
  });
});

describe('allowed form of a parsed finding', () => {
  it('is kept, also for the worse message of a ratchet', () => {
    const parsed = parseFinding({
      ...BASE,
      message: 'File has 400 lines. Split it.',
      allowedForm: 'Split it.',
      ratchet: {
        key: 'file-lines',
        value: 400,
        worseMessage: 'File grew from {base} to 400 lines. Put new code in a new file.',
        worseAllowedForm: 'Put new code in a new file.',
      },
    });

    expect(fieldOf(parsed, 'allowedForm')).toBe('Split it.');
    expect(fieldAt(parsed, 'ratchet', 'worseAllowedForm')).toBe('Put new code in a new file.');
    expect(accepted(parsed)).toBe(true);
  });

  it('must be a non-empty string', () => {
    expect(() => parseFinding({ ...BASE, message: 'Long.', allowedForm: '' })).toThrow(TypeError);
    expect(() => parseFinding({ ...BASE, message: 'Long.', allowedForm: 3 })).toThrow(TypeError);
  });
});

describe('the findings schema', () => {
  const finding = { ...BASE, message: 'File has 400 lines.' };

  it('takes the advice fields', () => {
    expect(
      accepted({
        ...finding,
        allowedForm: 'Split it.',
        exception: ENTRY,
        exceptionList: 'exceptions',
      }),
    ).toBe(true);
  });

  it.each([
    ['an exception without its list', { exception: ENTRY }],
    ['a list without its exception', { exceptionList: 'exceptions' }],
    ['an unknown list', { exception: ENTRY, exceptionList: 'elsewhere' }],
    [
      'an exception without paths',
      { exception: { rule: 'x', reason: 'r' }, exceptionList: 'exceptions' },
    ],
    ['an empty allowed form', { allowedForm: '' }],
    ['an unknown field', { unknown: 'value' }],
  ])('refuses %s', (_name, fields) => {
    expect(accepted({ ...finding, ...fields })).toBe(false);
  });
});
