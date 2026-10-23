import { describe, expect, it } from 'vitest';
import {
  BASE_GREW_MESSAGES,
  BASE_MESSAGES,
  allowedForm,
  allowedFormField,
  definedField,
  messageFields,
  renderMessage,
} from './messages.mjs';
import { GREW_MESSAGES, MESSAGES } from '../policy.mjs';

const TEMPLATE = `{name} is big. ${allowedForm('Split {name}.')} ${allowedForm('Then rename it.')} Done.`;

describe('allowed form spans', () => {
  it('print as plain text in the message', () => {
    expect(renderMessage(TEMPLATE, { name: 'f' })).toBe('f is big. Split f. Then rename it. Done.');
  });

  it('give the message and the field together, and no field without a span', () => {
    expect(messageFields(TEMPLATE, { name: 'f' })).toEqual({
      message: 'f is big. Split f. Then rename it. Done.',
      allowedForm: 'Split f. Then rename it.',
    });
    expect(messageFields('{name} is big.', { name: 'f' })).toEqual({ message: 'f is big.' });
  });
});

describe('field helpers', () => {
  it('leave out what is undefined', () => {
    expect(definedField('a', undefined)).toEqual({});
    expect(definedField('a', 1)).toEqual({ a: 1 });
    expect(allowedFormField(undefined, undefined)).toEqual({});
    expect(allowedFormField('Split it.', undefined, 'Name it.')).toEqual({
      allowedForm: 'Split it. Name it.',
    });
  });
});

describe('every shared message template', () => {
  const templates = Object.entries({
    ...BASE_MESSAGES,
    ...BASE_GREW_MESSAGES,
    ...MESSAGES,
    ...GREW_MESSAGES,
  });

  it.each(templates)('%s prints without markers and its span is part of its message', (_, text) => {
    const values = new Proxy({}, { get: (_target, key) => `<${String(key)}>` });
    const { message, allowedForm: allowed } = messageFields(text, values);

    expect(message).not.toMatch(/[⟦⟧]/u);
    if (allowed !== undefined) {
      expect(message).toContain(allowed);
    }
  });
});
