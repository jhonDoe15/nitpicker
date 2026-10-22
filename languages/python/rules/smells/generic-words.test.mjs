import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_MANAGER_ROLES,
  GENERIC_NAME_WORDS,
} from '../../../../shared/naming/smell-words.mjs';

function pythonWords(setName) {
  const source = readFileSync(path.resolve(import.meta.dirname, 'names.py'), 'utf8');
  const block = new RegExp(`${setName} = \\{([^}]*)\\}`).exec(source)?.[1] ?? '';
  return [...block.matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
}

describe('the word lists of the Python name rule', () => {
  it('are the generic words every preset bans', () => {
    expect(pythonWords('GENERIC_WORDS').toSorted()).toEqual(GENERIC_NAME_WORDS.toSorted());
  });

  it('are the manager roles every preset accepts', () => {
    expect(pythonWords('ACCEPTED_MANAGER_WORDS').toSorted()).toEqual(
      ACCEPTED_MANAGER_ROLES.toSorted(),
    );
  });
});
