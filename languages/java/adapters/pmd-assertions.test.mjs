import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from './java-analyzer.mjs';

const REPOSITORY_ROOT = path.join(import.meta.dirname, '../../..');
const EXTRA_ASSERTS = /<property name="extraAssertMethodNames"\s+value="([^"]*)"/;

function extraAssertNames() {
  const ruleset = configurationFiles().find((file) => file.endsWith('pmd-ruleset.xml'));
  return EXTRA_ASSERTS.exec(readFileSync(path.join(REPOSITORY_ROOT, ruleset ?? ''), 'utf8'))?.[1];
}

describe('PMD test assertion names', () => {
  it('counts MockMvc, AssertJ and Mockito BDD, and WebTestClient calls as assertions', () => {
    expect(extraAssertNames()).toBe(
      'andExpect,andExpectAll,then,thenThrownBy,thenCode,thenNoException,should,expectStatus,expectBody,expectHeader,expectCookie',
    );
  });

  it('is a comma-separated list without spaces, the way PMD 7 reads it', () => {
    expect((extraAssertNames() ?? '').split(',').every((name) => /^[A-Za-z]+$/.test(name))).toBe(
      true,
    );
  });
});
