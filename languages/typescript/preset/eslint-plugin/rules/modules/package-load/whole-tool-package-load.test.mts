import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './whole-tool-package-load.mts';

const tester = typescriptRuleTester();
const prodFile = '/repo/src/lint/load.ts';

function errorFor(member: string, subpackage: string) {
  return [
    {
      messageId: 'wholeToolPackageLoad',
      data: {
        aggregate: 'typescript-eslint',
        member,
        subpackage,
      },
    },
  ];
}

tester.run('whole-tool-package-load', rule, {
  valid: [
    {
      filename: prodFile,
      code: "const { parser, plugin } = require('typescript-eslint'); export { parser, plugin };",
    },
    {
      filename: prodFile,
      code: "const { parser, configs } = await import('typescript-eslint'); export { parser, configs };",
    },
    {
      filename: prodFile,
      code: "const tseslint = require('typescript-eslint'); export const out = [tseslint.parser, tseslint.configs];",
    },
    {
      filename: prodFile,
      code: "const tseslint = require('typescript-eslint'); export const out = [tseslint.parser, tseslint.plugin];",
    },
    {
      filename: prodFile,
      code: "export const configs = require('typescript-eslint').configs;",
    },
    {
      filename: prodFile,
      code: "export const tseslint = require('typescript-eslint');",
    },
    {
      filename: prodFile,
      code: "const tseslint = require('typescript-eslint'); export function run() { return tseslint; }",
    },
    {
      filename: prodFile,
      code: "const tseslint = require('typescript-eslint'); export const copy = { ...tseslint };",
    },
    {
      filename: prodFile,
      code: "const { parser, ...rest } = require('typescript-eslint'); export { parser, rest };",
    },
    {
      filename: prodFile,
      code: "const tseslint = require('typescript-eslint');",
    },
    {
      filename: prodFile,
      code: "let tseslint = require('typescript-eslint'); tseslint = other; export const p = tseslint.parser;",
    },
    {
      filename: prodFile,
      code: "const tseslint = require('typescript-eslint'); export const p = tseslint[key];",
    },
    {
      filename: prodFile,
      code: "export const parser = require('other-package').parser;",
    },
    {
      filename: prodFile,
      code: 'export const parser = require(pkgName).parser;',
    },
    {
      filename: prodFile,
      code: "const custom = makeLoader(); export const parser = custom('typescript-eslint').parser;",
    },
    {
      filename: '/repo/src/lint/load.test.ts',
      code: "export const parser = require('typescript-eslint').parser;",
    },
    {
      filename: '/repo/src/lint/load.spec.mts',
      code: "export const { plugin } = await import('typescript-eslint');",
    },
    {
      filename: '/repo/tests/lint-helper.ts',
      code: "const tseslint = require('typescript-eslint'); export const p = tseslint.parser;",
    },
    {
      filename: '/repo/src/__tests__/setup.ts',
      code: "export const parser = createRequire(import.meta.url)('typescript-eslint').parser;",
    },
  ],
  invalid: [
    {
      filename: prodFile,
      code: "export const parser = require('typescript-eslint').parser;",
      errors: errorFor('parser', '@typescript-eslint/parser'),
    },
    {
      filename: prodFile,
      code: "export const plugin = require('typescript-eslint')['plugin'];",
      errors: errorFor('plugin', '@typescript-eslint/eslint-plugin'),
    },
    {
      filename: prodFile,
      code: "export async function load() { return (await import('typescript-eslint')).parser; }",
      errors: errorFor('parser', '@typescript-eslint/parser'),
    },
    {
      filename: prodFile,
      code: "export async function load() { return (await import('typescript-eslint')).plugin; }",
      errors: errorFor('plugin', '@typescript-eslint/eslint-plugin'),
    },
    {
      filename: prodFile,
      code: "const { parser } = require('typescript-eslint'); export { parser };",
      errors: errorFor('parser', '@typescript-eslint/parser'),
    },
    {
      filename: prodFile,
      code: "export async function load() { const { plugin: eslintPlugin } = await import('typescript-eslint'); return eslintPlugin; }",
      errors: errorFor('plugin', '@typescript-eslint/eslint-plugin'),
    },
    {
      filename: prodFile,
      code: "let parser; ({ parser } = require('typescript-eslint')); export { parser };",
      errors: errorFor('parser', '@typescript-eslint/parser'),
    },
    {
      filename: prodFile,
      code: "const tseslint = require('typescript-eslint'); export const a = tseslint.parser; export const b = tseslint.parser;",
      errors: errorFor('parser', '@typescript-eslint/parser'),
    },
    {
      filename: prodFile,
      code: "export async function load() { const tseslint = await import('typescript-eslint'); return tseslint.plugin; }",
      errors: errorFor('plugin', '@typescript-eslint/eslint-plugin'),
    },
    {
      filename: prodFile,
      code: "import { createRequire } from 'node:module'; export const parser = createRequire(import.meta.url)('typescript-eslint').parser;",
      errors: errorFor('parser', '@typescript-eslint/parser'),
    },
    {
      filename: prodFile,
      code: "import { createRequire } from 'node:module'; const req = createRequire(import.meta.url); export const { plugin } = req('typescript-eslint');",
      errors: errorFor('plugin', '@typescript-eslint/eslint-plugin'),
    },
    {
      filename: prodFile,
      code: "import Module from 'node:module'; const req = Module.createRequire(import.meta.url); const tseslint = req('typescript-eslint'); export const p = tseslint.parser;",
      errors: errorFor('parser', '@typescript-eslint/parser'),
    },
    {
      filename: prodFile,
      code: "export const parser = (require('typescript-eslint') as { parser: unknown }).parser;",
      errors: errorFor('parser', '@typescript-eslint/parser'),
    },
  ],
});
