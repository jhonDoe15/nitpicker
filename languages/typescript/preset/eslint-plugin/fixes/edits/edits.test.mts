import { typescriptRuleTester, configuredRuleTester } from '../../test-support/rule-tester.mts';
import tseslint from 'typescript-eslint';
import { importingName } from './imports.mts';
import { freeName } from './names.mts';
import { declines, fixes, useRule } from './test-support/use-rule.mts';

const rule = useRule(({ sourceCode, call }) => {
  const edit = importingName(sourceCode, sourceCode.ast, {
    sources: ['typeorm'],
    name: 'In',
    sites: [call],
  });
  const name = freeName(sourceCode, { sites: [call], within: call, base: 'byId' });
  return edit === undefined || name === undefined
    ? undefined
    : { imports: edit.present ? undefined : edit.plan, text: `In(${name})` };
});

typescriptRuleTester().run('fix edit helpers', rule, {
  valid: [],
  invalid: [
    fixes('export const a = use();', "import { In } from 'typeorm';\nexport const a = In(byId);"),
    fixes(
      "import { Repository } from 'typeorm';\nexport const a = use();",
      "import { Repository, In } from 'typeorm';\nexport const a = In(byId);",
    ),
    fixes(
      'import { In, Repository } from "typeorm";\nexport const a = use();',
      'import { In, Repository } from "typeorm";\nexport const a = In(byId);',
    ),
    fixes(
      'import type { Repository } from "typeorm";\nexport const a = use();',
      'import type { Repository } from "typeorm";\nimport { In } from "typeorm";\nexport const a = In(byId);',
    ),
    fixes(
      "import typeorm from 'typeorm';\nexport const a = use();",
      "import typeorm from 'typeorm';\nimport { In } from 'typeorm';\nexport const a = In(byId);",
    ),
    fixes(
      "import { type Repository } from 'typeorm';\nexport const a = use();",
      "import { type Repository, In } from 'typeorm';\nexport const a = In(byId);",
    ),
    fixes(
      "'use client';\nexport const a = use();",
      "'use client';\nimport { In } from 'typeorm';\nexport const a = In(byId);",
    ),
    fixes(
      "import { In as Within } from 'typeorm';\nexport const a = use();",
      "import { In as Within, In } from 'typeorm';\nexport const a = In(byId);",
    ),
    fixes(
      'const byId = 1;\nexport const a = use(byId);',
      "import { In } from 'typeorm';\nconst byId = 1;\nexport const a = In(byId2);",
    ),
    fixes(
      'export function f() { const byId2 = 2; return () => { const byId = 1; return [byId, byId2, use()]; }; }',
      "import { In } from 'typeorm';\nexport function f() { const byId2 = 2; return () => { const byId = 1; return [byId, byId2, In(byId3)]; }; }",
    ),
    fixes('export const a = use()', "import { In } from 'typeorm'\nexport const a = In(byId)"),
    fixes(
      'import { x } from "y"\nexport const a = use()',
      'import { x } from "y"\nimport { In } from "typeorm"\nexport const a = In(byId)',
    ),
    fixes(
      "import { x } from 'y';\nimport z from 'z'\nexport const a = use()",
      "import { x } from 'y';\nimport z from 'z'\nimport { In } from 'typeorm'\nexport const a = In(byId)",
    ),
    fixes(
      "'use client'\nexport const a = use()",
      "'use client'\nimport { In } from 'typeorm'\nexport const a = In(byId)",
    ),
    fixes(
      'export class A {}\nexport const a = use()',
      "import { In } from 'typeorm'\nexport class A {}\nexport const a = In(byId)",
    ),
    fixes(
      'export function f() {}\nexport const a = use()',
      "import { In } from 'typeorm'\nexport function f() {}\nexport const a = In(byId)",
    ),
    fixes(
      'export function f() {}\nexport const a = use();',
      "import { In } from 'typeorm';\nexport function f() {}\nexport const a = In(byId);",
    ),
    declines('export function f() { const In = 1; return In; }\nexport const a = use();'),
    declines('export const a = use(In);'),
    declines(
      "import { In } from 'typeorm';\nexport function f() { const In = 2; return [In, use()]; }",
    ),
    declines('// header\nexport const a = use();'),
    fixes(
      'export const a = () => { use(); const byId = 1; return byId; };',
      "import { In } from 'typeorm';\nexport const a = () => { In(byId2); const byId = 1; return byId; };",
    ),
  ],
});

configuredRuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', parser: tseslint.parser },
}).run('fix edit helpers in CommonJS', rule, {
  valid: [],
  invalid: [declines("const typeorm = require('typeorm');\nmodule.exports = use();")],
});
