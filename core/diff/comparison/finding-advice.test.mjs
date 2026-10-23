import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  exceptionEntryText,
  exceptionSentence,
} from '../../../shared/messages/exception-sentence.mjs';
import { parseFinding } from './finding-schema.mjs';

const schema = JSON.parse(
  readFileSync(
    path.resolve(
      fileURLToPath(new URL('.', import.meta.url)),
      '../../../spec/findings.schema.json',
    ),
    'utf8',
  ),
);
const validates = new Ajv2020({ strict: false }).compile(schema);

const ENTRY = { rule: 'file-lines-limit', paths: ['src/a.ts'], reason: '...' };
const BASE = {
  tool: 'structure',
  rule: 'file-lines-limit',
  path: 'src/a.ts',
  identity: 'file-lines',
  classification: 'enforceable',
};
const withSentence = (list) =>
  `File has 400 lines. Split it. ${exceptionSentence(exceptionEntryText({ rule: ENTRY.rule, path: 'src/a.ts' }), list)}`;

function accepted(finding) {
  return validates({ findings: [finding] });
}

describe('exception of a parsed finding', () => {
  it('is read from the sentence the message ends with, with the list that takes it', () => {
    const parsed = parseFinding({ ...BASE, message: withSentence('exceptions') });

    expect(parsed.exception).toEqual(ENTRY);
    expect(parsed.exceptionList).toBe('exceptions');
    expect(accepted(parsed)).toBe(true);
  });

  it('names the Python list for a Python rule', () => {
    const parsed = parseFinding({ ...BASE, message: withSentence('python.exceptions') });

    expect(parsed.exceptionList).toBe('python.exceptions');
  });

  it('is absent for a message without the sentence', () => {
    const parsed = parseFinding({ ...BASE, message: 'File has 400 lines.' });

    expect(parsed).not.toHaveProperty('exception');
    expect(parsed).not.toHaveProperty('exceptionList');
  });

  it('keeps the entry an analyzer gives', () => {
    const exception = { rule: 'x', paths: ['y'], reason: 'because' };
    const parsed = parseFinding({
      ...BASE,
      message: withSentence('exceptions'),
      exception,
      exceptionList: 'exceptions',
    });

    expect(parsed.exception).toEqual(exception);
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

    expect(parsed.allowedForm).toBe('Split it.');
    expect(parsed.ratchet.worseAllowedForm).toBe('Put new code in a new file.');
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
