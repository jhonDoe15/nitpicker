import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-aggregate-package-for-one-member.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'wholePackage' }] };
}

tester.run('no-aggregate-package-for-one-member', rule, {
  valid: [
    "import tseslint from 'typescript-eslint'; export default tseslint.config({ languageOptions: { parser: tseslint.parser }, plugins: { x: tseslint.plugin } });",
    "import tseslint from 'typescript-eslint'; export default tseslint.config(base);",
    "const parser = require('@typescript-eslint/parser');",
    "const all = require('typescript-eslint'); use(all);",
    "import type { Config } from 'typescript-eslint'; export type C = Config;",
    "const { parser, plugin } = require('typescript-eslint'); use(parser, plugin);",
    "import tseslint from 'typescript-eslint'; use(tseslint);",
    "const all = require('typescript-eslint'); all.parser = other;",
    "use(require('typescript-eslint'));",
    "const all = require('typescript-eslint'); all['parser'];",
    "cache[require('typescript-eslint')];",
    "const [first] = require('typescript-eslint'); use(first);",
    "const { parser, ...rest } = require('typescript-eslint'); use(parser, rest);",
    "const { [key]: parser } = require('typescript-eslint'); use(parser);",
    "foo('typescript-eslint').parser;",
    "other()('typescript-eslint').parser;",
    'require(name).parser;',
    "require('other').parser;",
    "import('other');",
    'import(name);',
    "import { 'parser' as p } from 'typescript-eslint'; use(p);",
    "import { parser, plugin } from 'typescript-eslint'; use(parser, plugin);",
    "const tseslint = require('typescript-eslint'); tseslint.config(base);",
  ],
  invalid: [
    invalid("const parser = require('typescript-eslint').parser;"),
    invalid(
      "import { createRequire } from 'node:module'; export function f(root) { return createRequire(root)('typescript-eslint').parser; }",
    ),
    invalid(
      "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); const tseslint = load('typescript-eslint'); use(tseslint.plugin);",
    ),
    invalid(
      "export async function f() { const { parser } = await import('typescript-eslint'); return parser; }",
    ),
    invalid("import tseslint from 'typescript-eslint'; export const parser = tseslint.parser;"),
    invalid(
      "import { parser } from 'typescript-eslint'; export default { languageOptions: { parser } };",
    ),
    invalid(
      "import { type Config, parser } from 'typescript-eslint'; export const c: Config = { parser };",
    ),
  ],
});
