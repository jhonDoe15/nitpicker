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
