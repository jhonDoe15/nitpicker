import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SECRET_NAME_WORDS,
  SECRET_VALUE_SUFFIXES,
} from '../../../../shared/naming/secret-words.mjs';

const SOURCE = readFileSync(path.resolve(import.meta.dirname, 'secrets.py'), 'utf8');

function secretNameWords() {
  const compiled = /SECRET_NAME = re\.compile\(\n([\s\S]*?)\n\)/.exec(SOURCE)?.[1] ?? '';
  const pattern = [...compiled.matchAll(/"([^"]*)"/g)].map((match) => match[1]).join('');
  return /\(\?:([^)]*)\)\$/.exec(pattern)?.[1].split('|') ?? [];
}

function valueSuffixes() {
  const block = /VALUE_SUFFIXES = \{([^}]*)\}/.exec(SOURCE)?.[1] ?? '';
  return [...block.matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
}

describe('the secret names of the Python rules', () => {
  it('are the words every preset reads as a secret', () => {
    expect(secretNameWords().toSorted()).toEqual(SECRET_NAME_WORDS.toSorted());
  });

  it('strip the same value suffixes', () => {
    expect(valueSuffixes().toSorted()).toEqual(SECRET_VALUE_SUFFIXES.toSorted());
  });
});
