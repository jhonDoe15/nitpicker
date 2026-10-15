import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noComments } from './rules/modules/no-comments.mjs';

RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: tseslint.parser,
  },
});

ruleTester.run('no-comments', noComments, {
  valid: [
    { code: '/** Parses a date. */\nexport function parse(text: string) { return text; }' },
    { code: '/** The default port. */\nexport const port = 80;' },
    { code: '/** Reads the config. */\nexport default function read() { return 1; }' },
    { code: '/** A user. */\nexport type User = {\n  /** Display name. */\n  name: string;\n};' },
    { code: '/** @jsxImportSource preact */\nexport const a = 1;' },
    { code: '/* eslint no-console: off */\nexport const a = 1;' },
  ],
  invalid: [
    {
      code: '/** Parses a date. */\nfunction parse(text: string) { return text; }',
      errors: [{ messageId: 'internalDocComment' }],
    },
    {
      code: 'export function parse(text: string) {\n  /** Trim first. */\n  return text.trim();\n}',
      errors: [{ messageId: 'internalDocComment' }],
    },
    {
      code: 'type User = {\n  /** Display name. */\n  name: string;\n};',
      errors: [{ messageId: 'internalDocComment' }],
    },
    { code: '/** Trailing doc. */', errors: [{ messageId: 'internalDocComment' }] },
    {
      code: '// Parses a date.\nexport function parse() { return 1; }',
      errors: [{ messageId: 'comment' }],
    },
    {
      code: '/* Parses a date. */\nexport function parse() { return 1; }',
      errors: [{ messageId: 'comment' }],
    },
    {
      code: '/** @ts-ignore */\nexport const a = 1;',
      errors: [{ messageId: 'typescriptSuppression' }],
    },
    ...[
      ['/* istanbul ignore next */', 'istanbul ignore'],
      ['/* c8 ignore start */', 'c8 ignore'],
      ['/* v8 ignore next */', 'v8 ignore'],
      ['// Stryker disable next-line all', 'Stryker disable'],
      ['// stryker restore all', 'stryker restore'],
      ['/* istanbul  ignore\tnext */', 'istanbul ignore'],
      ['/** istanbul ignore next */', 'istanbul ignore'],
      ['/**\n * c8 ignore next\n */', 'c8 ignore'],
    ].map(([comment, directive]) => ({
      code: `${comment}\nexport const a = 1;`,
      errors: [{ messageId: 'coverageSuppression', data: { directive } }],
    })),
    {
      code: 'export type T = {\n  /** v8 ignore next */\n  a: number;\n};',
      errors: [{ messageId: 'coverageSuppression', data: { directive: 'v8 ignore' } }],
    },
    {
      code: 'export const a = 1; // istanbul ignore next',
      errors: [{ messageId: 'coverageSuppression', data: { directive: 'istanbul ignore' } }],
    },
  ],
});

const suppressionsOnly = [{ suppressionsOnly: true }];

ruleTester.run('no-comments, suppression comments only', noComments, {
  valid: [
    { code: "// the order matters here\nit('x', () => {});", options: suppressionsOnly },
    { code: '/** Builds a user. */\nfunction build() { return 1; }', options: suppressionsOnly },
    { code: '// @jsxImportSource preact\nexport const a = 1;', options: suppressionsOnly },
  ],
  invalid: [
    {
      code: '// @ts-expect-error wrong on purpose\nrun(1);',
      options: suppressionsOnly,
      errors: [{ messageId: 'typescriptSuppression' }],
    },
    {
      code: '// Stryker disable all\nexport const a = 1;',
      options: suppressionsOnly,
      errors: [{ messageId: 'coverageSuppression' }],
    },
    {
      code: 'run(); /* v8 ignore next */',
      options: suppressionsOnly,
      errors: [{ messageId: 'coverageSuppression' }],
    },
  ],
});
