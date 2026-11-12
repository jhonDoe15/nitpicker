import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as shared from '../../../../../shared/naming/secret-words.mjs';

const SOURCE = readFileSync(path.resolve(import.meta.dirname, 'spec.go'), 'utf8');
const LISTS = [
  'SECRET_NAME_WORDS',
  'SECRET_VALUE_SUFFIXES',
  'MARKER_TOKEN_WORDS',
  'PASSPHRASE_NAME_WORDS',
  'PLACEHOLDER_PATTERNS',
  'NOT_SECRET_PATTERNS',
  'IDENTIFIER_PATTERNS',
  'CREDENTIAL_SHAPES',
  'EMBEDDED_SECRET_PATTERNS',
];
const NUMBERS = ['SECRET_VALUE_LENGTH', 'SECRET_CHARACTER_CLASSES', 'PASSPHRASE_LENGTH'];

function goName(name) {
  return name.toLowerCase().replaceAll(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function goList(name) {
  const block = new RegExp(String.raw`^\t${goName(name)} = \[\]string\{\n(.*?)^\t\}$`, 'ms').exec(SOURCE)?.[1];
  return [...(block ?? '').matchAll(/^\t\t`([^`]*)`,$/gm)].map((match) => match[1]);
}

function goNumber(name) {
  return Number(new RegExp(String.raw`^\t${goName(name)}\s+= (\d+)$`, 'm').exec(SOURCE)?.[1]);
}

describe('the secret definition of the Go rules', () => {
  it.each(LISTS)('mirrors %s', (name) => {
    expect(goList(name)).toEqual(shared[name]);
  });

  it.each(NUMBERS)('mirrors %s', (name) => {
    expect(goNumber(name)).toBe(shared[name]);
  });
});
