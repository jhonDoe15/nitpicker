import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERIC_NAME_WORDS } from '../../../../shared/naming/smell-words.mjs';

function pythonWords() {
  const source = readFileSync(path.resolve(import.meta.dirname, 'names.py'), 'utf8');
  const block = /GENERIC_WORDS = \{([^}]*)\}/.exec(source)?.[1] ?? '';
  return [...block.matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
}

describe('the generic names of the Python rule', () => {
  it('are the words every preset bans', () => {
    expect(pythonWords().toSorted()).toEqual(GENERIC_NAME_WORDS.toSorted());
  });
});
