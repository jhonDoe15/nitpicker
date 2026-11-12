import { describe, expect, it } from 'vitest';
import { wordsOfCamelCase, wordsOfConstant, wordsOfKebab } from './words.mjs';

describe('rule names as words', () => {
  it('splits a camel-case name, keeping acronyms together', () => {
    expect(wordsOfCamelCase('UnusedPrivateField')).toBe('Unused private field');
    expect(wordsOfCamelCase('HTTPServerError')).toBe('Http server error');
    expect(wordsOfCamelCase('MD5Hash')).toBe('Md5 hash');
  });

  it('splits a constant name', () => {
    expect(wordsOfConstant('AA_ASSERTION_OF_ARGUMENTS')).toBe('Aa assertion of arguments');
  });

  it('splits a kebab-case name', () => {
    expect(wordsOfKebab('domain-does-not-import-adapters')).toBe('Domain does not import adapters');
  });
});
