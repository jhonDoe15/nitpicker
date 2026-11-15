import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as shared from '../../../../shared/naming/secret-words.mjs';

const sharedValues: Readonly<Record<string, unknown>> = shared;
const SOURCE = readFileSync(path.resolve(import.meta.dirname, 'spec.py'), 'utf8');
const LISTS = [
  'SECRET_NAME_WORDS',
  'SECRET_VALUE_SUFFIXES',
  'MARKER_TOKEN_WORDS',
  'MASKED_NAME_WORDS',
  'PASSPHRASE_NAME_WORDS',
  'PLACEHOLDER_PATTERNS',
  'NOT_SECRET_PATTERNS',
  'IDENTIFIER_PATTERNS',
  'CREDENTIAL_SHAPES',
  'EMBEDDED_SECRET_PATTERNS',
];
const NUMBERS = ['SECRET_VALUE_LENGTH', 'SECRET_CHARACTER_CLASSES', 'PASSPHRASE_LENGTH'];

function pythonList(name: string): (string | undefined)[] {
  const block = new RegExp(String.raw`^${name} = \[(.*?)^\]$`, 'ms').exec(SOURCE)?.[1] ?? '';
  return [...block.matchAll(/^\s+r?"((?:[^"\\]|\\.)*)",$/gm)].map((match) => match[1]);
}

function pythonNumber(name: string): number {
  return Number(new RegExp(String.raw`^${name} = (\d+)$`, 'm').exec(SOURCE)?.[1]);
}

describe('the secret definition of the Python rules', () => {
  it.each(LISTS)('mirrors %s', (name) => {
    expect(pythonList(name)).toEqual(sharedValues[name]);
  });

  it.each(NUMBERS)('mirrors %s', (name) => {
    expect(pythonNumber(name)).toBe(sharedValues[name]);
  });
});
