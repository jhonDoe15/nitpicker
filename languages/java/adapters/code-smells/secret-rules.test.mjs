import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as secretWords from '../../../../shared/naming/secret-words.mjs';
import { secretValueCasesSource } from '../test-support/code-smells/secret-cases.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const ruleset = readFileSync(
  path.join(packageRoot, 'languages/java/gradle/code-smells-ruleset.xml'),
  'utf8',
);
const casesFixture = path.join(
  import.meta.dirname,
  '../fixtures/code-smells-project/src/main/java/shop/secrets/SecretValueCases.java',
);

const SHARED_LISTS = {
  nameWords: secretWords.SECRET_NAME_WORDS,
  valueSuffixes: secretWords.SECRET_VALUE_SUFFIXES,
  markerTokens: secretWords.MARKER_TOKEN_WORDS,
  passphraseNames: secretWords.PASSPHRASE_NAME_WORDS,
  placeholders: secretWords.PLACEHOLDER_PATTERNS,
  notSecret: secretWords.NOT_SECRET_PATTERNS,
  identifiers: secretWords.IDENTIFIER_PATTERNS,
  credentialShapes: secretWords.CREDENTIAL_SHAPES,
  embeddedSecrets: secretWords.EMBEDDED_SECRET_PATTERNS,
};
const SHARED_NUMBERS = {
  valueLength: secretWords.SECRET_VALUE_LENGTH,
  characterClasses: secretWords.SECRET_CHARACTER_CLASSES,
  passphraseLength: secretWords.PASSPHRASE_LENGTH,
};

function xpathOf(name) {
  const start = ruleset.indexOf(`<rule name="${name}"`);
  const rule = ruleset.slice(start, ruleset.indexOf('</rule>', start));
  return rule.slice(rule.indexOf('<![CDATA[') + 9, rule.indexOf(']]>'));
}

function boundLists(xpath) {
  const bound = Object.keys(SHARED_LISTS).flatMap((variable) => {
    const list = new RegExp(String.raw`\$${variable} := \(((?:'(?:[^']|'')*'(?:,\s*)?)*)\)`).exec(
      xpath,
    );
    const items = [...(list?.[1] ?? '').matchAll(/'((?:[^']|'')*)'/g)];
    return list === null ? [] : [[variable, items.map(([, item]) => item.replaceAll("''", "'"))]];
  });
  return Object.fromEntries(bound);
}

function boundNumbers(xpath) {
  const bound = Object.keys(SHARED_NUMBERS).flatMap((variable) => {
    const value = new RegExp(String.raw`\$${variable} := (\d+),`).exec(xpath)?.[1];
    return value === undefined ? [] : [[variable, Number(value)]];
  });
  return Object.fromEntries(bound);
}

function shared(source, names) {
  return Object.fromEntries(names.map((name) => [name, source[name]]));
}

describe('the Java secret rules', () => {
  it.each(['HardcodedSecret', 'CredentialLiteral', 'SecretInLog'])(
    '%s binds the lists and numbers of the shared secret definition',
    (name) => {
      const lists = boundLists(xpathOf(name));
      const numbers = boundNumbers(xpathOf(name));

      expect({ lists, numbers }).toEqual({
        lists: shared(SHARED_LISTS, Object.keys(lists)),
        numbers: shared(SHARED_NUMBERS, Object.keys(numbers)),
      });
    },
  );

  it('HardcodedSecret binds every list and number the shared definition has', () => {
    const xpath = xpathOf('HardcodedSecret');

    expect([Object.keys(boundLists(xpath)), Object.keys(boundNumbers(xpath))]).toEqual([
      Object.keys(SHARED_LISTS),
      Object.keys(SHARED_NUMBERS),
    ]);
  });

  it('keeps one fixture class for every row of the shared secret value cases', () => {
    expect(readFileSync(casesFixture, 'utf8')).toBe(secretValueCasesSource());
  });
});
