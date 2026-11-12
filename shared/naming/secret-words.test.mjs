import { describe, expect, it } from 'vitest';
import {
  hasCredentialShape,
  isHardcodedSecret,
  isSecretName,
  looksLikeSecretValue,
} from './secret-words.mjs';
import { SECRET_VALUE_CASES } from './test-support/secret-value-cases.mjs';

function verdict(name, value) {
  if (hasCredentialShape(value)) {
    return 'credential';
  }
  return isSecretName(name) && isHardcodedSecret(value, name) ? 'secret' : 'none';
}

describe('the shared secret definition', () => {
  it.each(SECRET_VALUE_CASES)('reads %s = %j as %s', (name, value, expected) => {
    expect(verdict(name, value)).toBe(expected);
  });

  it('reads names by their last words, without value suffixes or marker tokens', () => {
    const names = [
      'dbPasswordValue',
      'API_TOKEN',
      'hmac_key',
      'eosToken',
      'pad_token',
      'tokenizer',
    ];
    expect(names.map((name) => isSecretName(name))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('checks the secret inside a header, URL or query string with the same value rules', () => {
    const values = ['Bearer abc', 'token $TOKEN', 'https://u:changeme@h', '?password=hunter22'];
    expect(values.map((value) => hasCredentialShape(value))).toEqual([false, false, false, true]);
    expect(looksLikeSecretValue('a1b2c3')).toBe(true);
  });
});
