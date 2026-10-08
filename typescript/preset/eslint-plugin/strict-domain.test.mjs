import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { lintFixture } from '../failure-messages/harness.mjs';
import strictDomainConfig from '../eslint-config/strict-domain.mjs';
import noSelfRecursion from './rules/no-self-recursion.mjs';
import noThrow from './rules/no-throw.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

tester.run('no-self-recursion', noSelfRecursion, {
  valid: [
    'function total(items) { return items.map((item) => item.value); }',
    'function a() { return b(); } function b() { return 1; }',
    'const total = (items) => items.map(price);',
    'function outer() { function inner() { return 1; } return inner(); }',
    'function f(f) { return f(); }',
    'function f() { const g = () => { const f = () => 1; return f(); }; return g(); }',
    'const object = { total(items) { return items.total(); } };',
  ],
  invalid: [
    {
      code: 'function total(items) { return items.length === 0 ? 0 : total(items.slice(1)); }',
      errors: [{ messageId: 'recursion' }],
    },
    {
      code: 'const walk = (node) => node.children.flatMap((child) => walk(child));',
      errors: [{ messageId: 'recursion' }],
    },
    {
      code: 'const walk = function (node) { return walk(node.next); };',
      errors: [{ messageId: 'recursion' }],
    },
    {
      code: 'const x = function named(node) { return named(node.next); };',
      errors: [{ messageId: 'recursion' }],
    },
    {
      code: 'export function count(n) { return n && count(n - 1); }',
      errors: [{ messageId: 'recursion' }],
    },
  ],
});

tester.run('no-throw', noThrow, {
  valid: [
    'function parse(input) { return input ? { kind: "ok", input } : { kind: "empty" }; }',
    'const make = () => new Error("not thrown");',
  ],
  invalid: [
    { code: 'function f() { throw new Error("x"); }', errors: [{ messageId: 'noThrow' }] },
    {
      code: 'try { run(); } catch (error) { throw error; }',
      errors: [{ messageId: 'noThrow' }],
    },
  ],
});

describe('strict domain config scope', () => {
  const code = 'function f() { throw new Error("x"); }';
  const ruleIds = (filename) =>
    lintFixture({ config: strictDomainConfig, filename, code })
      .map((m) => m.ruleId)
      .filter(Boolean);

  it('applies to feature domain files', () => {
    expect(ruleIds('src/main/features/billing/domain/parse.ts')).toEqual(['nitpicker/no-throw']);
    expect(ruleIds('src/main/features/billing/domain/nested/parse.ts')).toEqual([
      'nitpicker/no-throw',
    ]);
  });

  it('does not apply outside domain', () => {
    expect(ruleIds('src/main/features/billing/adapters/parse.ts')).toEqual([]);
    expect(ruleIds('src/main/shared/parse.ts')).toEqual([]);
  });
});
