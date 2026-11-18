import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { typescriptRuleTester, configuredRuleTester } from '../../test-support/rule-tester.mts';
import tseslint from 'typescript-eslint';
import { replacing } from '../support/ranges.mts';
import { importingName } from './imports.mts';
import { freeName } from './names.mts';
import { allOf } from './plans.mts';

const rule: TSESLint.RuleModule<'use'> = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { use: 'use' } },
  create(context) {
    const { sourceCode } = context;
    return {
      'CallExpression[callee.name="use"]'(call: TSESTree.CallExpression) {
        const program = sourceCode.ast;
        const edit = importingName(sourceCode, program, {
          sources: ['typeorm'],
          name: 'In',
          sites: [call],
        });
        const name = freeName(sourceCode, { sites: [call], within: call, base: 'byId' });
        const fix =
          edit === undefined || name === undefined
            ? undefined
            : allOf(
                [edit.present ? undefined : edit.plan, replacing(call.range, `In(${name})`)].filter(
                  (plan) => plan !== undefined,
                ),
              );
        context.report({ node: call, messageId: 'use', ...(fix === undefined ? {} : { fix }) });
      },
    };
  },
};

const ERR = [{ messageId: 'use' as const }];

function fixes(code: string, output: string) {
  return { code, output, errors: ERR };
}

function declines(code: string) {
  return { code, output: null, errors: ERR };
}

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
