import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IDENTIFIER_PATTERNS,
  MARKER_TOKEN_WORDS,
  MASKED_NAME_WORDS,
  NOT_SECRET_PATTERNS,
  PLACEHOLDER_PATTERNS,
  SECRET_NAME_WORDS,
  SECRET_VALUE_SUFFIXES,
} from '../../../../shared/naming/secret-words.mjs';

const RULES = path.resolve(import.meta.dirname, '../../gradle/rulesets/pmd-main-ruleset/secrets');
const read = (name) => readFileSync(path.join(RULES, `${name}.xml`), 'utf8');
const missingFrom = (text, fragments) => fragments.filter((fragment) => !text.includes(fragment));

describe('the PMD secret rules and the shared secret definition', () => {
  const hardcoded = read('HardcodedSecret');
  const logged = read('SecretInLog');

  it.each([
    ['HardcodedSecret', hardcoded],
    ['SecretInLog', logged],
  ])('%s ends a name in the shared secret words, without the value suffixes', (_name, text) => {
    const fragments = [
      `(?:${SECRET_NAME_WORDS.join('|')})$`,
      `(?: (?:${SECRET_VALUE_SUFFIXES.join('|')}))+$`,
      `(?:${MARKER_TOKEN_WORDS.join('|')}) token$`,
      `(?:${MASKED_NAME_WORDS.join('|')})(?: |$)`,
    ];

    expect(missingFrom(text, fragments)).toEqual([]);
  });

  it('HardcodedSecret holds the shared placeholder, constant and identifier shapes', () => {
    const fragments = [PLACEHOLDER_PATTERNS, NOT_SECRET_PATTERNS, IDENTIFIER_PATTERNS].map(
      (patterns) => `^(?:${patterns.join('|')})$`,
    );

    expect(missingFrom(hardcoded, fragments)).toEqual([]);
  });

  it('CredentialLiteral shares the value shapes of HardcodedSecret', () => {
    const credential = read('CredentialLiteral');
    const shapes = /\$shape := function[\s\S]*?\n {4}\}/u;

    expect(credential.match(shapes)[0]).toBe(hardcoded.match(shapes)[0]);
  });
});
